import { useState, useCallback, useRef } from 'react';
import { VersionedTransaction, Connection } from '@solana/web3.js';
import { apiService } from '@/services/api';
import { useAuth } from './useAuth';
import { useChain } from './useChain';

const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

const BASE_CHAIN_ID_HEX = '0x2105'; // 8453

/** Decode base64 to Uint8Array without needing Node's Buffer polyfill */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Well-known Solana token mints (mirrored from API) */
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  platformFee?: { amount: string; feeBps: number };
  raw: any;
  chain?: 'solana' | 'base';
}

type SwapStatus =
  | 'idle'
  | 'quoting'
  | 'approving'
  | 'signing'
  | 'sending'
  | 'confirming'
  | 'success'
  | 'error';

interface UseSwapReturn {
  quote: SwapQuote | null;
  status: SwapStatus;
  error: string | null;
  fetchQuote: (params: {
    inputMint?: string;
    outputMint?: string;
    amount: string;
    slippageBps?: number;
  }) => Promise<SwapQuote | null>;
  executeSwap: () => Promise<string | null>;
  reset: () => void;
}

/** Encode an ERC-20 `approve(address,uint256)` calldata. */
function encodeApprove(spender: string, amount: bigint): string {
  // selector for approve(address,uint256)
  const selector = '0x095ea7b3';
  const paddedSpender = spender.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return selector + paddedSpender + paddedAmount;
}

/** Poll eth_getTransactionReceipt until the tx is mined or we time out. */
async function waitForTransaction(
  provider: any,
  txHash: string,
  timeout = 60000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });
      if (receipt) return receipt;
    } catch {
      // Ignore transient RPC errors and continue polling.
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Transaction confirmation timeout');
}

/**
 * Hook for fetching swap quotes and executing swaps via the embedded wallet.
 *
 * Solana flow:
 * 1. fetchQuote() → GET /api/wallet/swap → Jupiter quote with platform fee
 * 2. executeSwap() → POST /api/wallet/swap → unsigned tx → Privy signs & sends
 *
 * Base flow:
 * 1. fetchQuote() → GET /api/wallet/swap?chain=base → KyberSwap quote
 * 2. executeSwap() → POST /api/wallet/swap → tx params → Privy ETH provider
 *    - If `requiresApproval`, send an ERC-20 approve tx first
 */
export function useSwap(): UseSwapReturn {
  const auth = useAuth();
  const { walletAddress, getWalletProvider } = auth;
  const { chain } = useChain();
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const quoteRef = useRef<SwapQuote | null>(null);
  const quoteFetchedAtRef = useRef<number>(0);

  const reset = useCallback(() => {
    setQuote(null);
    setStatus('idle');
    setError(null);
    quoteRef.current = null;
    quoteFetchedAtRef.current = 0;
  }, []);

  const fetchQuote = useCallback(
    async (params: {
      inputMint?: string;
      outputMint?: string;
      amount: string;
      slippageBps?: number;
    }): Promise<SwapQuote | null> => {
      try {
        setStatus('quoting');
        setError(null);

        const queryParams: Record<string, string> = {};

        if (chain === 'base') {
          // KyberSwap-backed Base quote
          queryParams.chain = 'base';
          if (params.inputMint) queryParams.sellToken = params.inputMint;
          if (params.outputMint) queryParams.buyToken = params.outputMint;
          queryParams.sellAmount = params.amount;
          if (params.slippageBps) queryParams.slippageBps = params.slippageBps.toString();
        } else {
          // Solana / Jupiter quote
          queryParams.amount = params.amount;
          if (params.inputMint) queryParams.inputMint = params.inputMint;
          if (params.outputMint) queryParams.outputMint = params.outputMint;
          if (params.slippageBps) queryParams.slippageBps = params.slippageBps.toString();
        }

        const response = await apiService.get<SwapQuote>('/wallet/swap', queryParams);
        setQuote(response);
        quoteRef.current = response;
        quoteFetchedAtRef.current = Date.now();
        setStatus('idle');
        return response;
      } catch (err: any) {
        const message = err?.message || 'Failed to fetch quote';
        setError(message);
        setStatus('error');
        console.warn('[useSwap] Quote error:', message);
        return null;
      }
    },
    [chain],
  );

  const executeSwap = useCallback(async (): Promise<string | null> => {
    const currentQuote = quoteRef.current;
    if (!currentQuote) {
      setError('No quote available. Fetch a quote first.');
      setStatus('error');
      return null;
    }

    const QUOTE_MAX_AGE_MS = 30_000;
    if (Date.now() - quoteFetchedAtRef.current > QUOTE_MAX_AGE_MS) {
      setError('Quote expired. Please refresh and try again.');
      setStatus('error');
      return null;
    }

    try {
      if (chain === 'base') {
        // ─── BASE SWAP ───
        const ethAddress = auth.ethWalletAddress;
        if (!ethAddress) {
          throw new Error('Base wallet not connected');
        }

        setStatus('signing');
        const txParams = await apiService.post<{
          chain: 'base';
          to: string;
          data: string;
          value: string;
          gas?: string;
          gasPrice?: string;
          chainId: number;
          from: string;
          allowanceTarget?: string;
          sellTokenAddress?: string;
          requiresApproval?: boolean;
        }>('/wallet/swap', {
          chain: 'base',
          quoteResponse: currentQuote.raw,
        });

        const provider = await auth.getEthWalletProvider?.();
        if (!provider) {
          throw new Error('ETH wallet provider not available. Please reconnect your wallet.');
        }

        // ── ERC-20 approval (if needed) ──
        if (txParams.requiresApproval && txParams.allowanceTarget && txParams.sellTokenAddress) {
          setStatus('approving');
          const maxUint256 = BigInt(2) ** BigInt(256) - BigInt(1);
          const approveData = encodeApprove(txParams.allowanceTarget, maxUint256);

          const approveTxHash: string = await provider.request({
            method: 'eth_sendTransaction',
            params: [
              {
                from: ethAddress,
                to: txParams.sellTokenAddress,
                data: approveData,
                value: '0x0',
                chainId: BASE_CHAIN_ID_HEX,
              },
            ],
          });

          await waitForTransaction(provider, approveTxHash);
        }

        // ── Swap transaction ──
        setStatus('sending');
        const swapTx: Record<string, string> = {
          from: ethAddress,
          to: txParams.to,
          data: txParams.data,
          value: txParams.value || '0x0',
          chainId: BASE_CHAIN_ID_HEX,
        };
        if (txParams.gas) {
          swapTx.gas = txParams.gas.startsWith('0x')
            ? txParams.gas
            : '0x' + parseInt(txParams.gas, 10).toString(16);
        }

        const txHash: string = await provider.request({
          method: 'eth_sendTransaction',
          params: [swapTx],
        });

        setStatus('confirming');
        await waitForTransaction(provider, txHash);

        setStatus('success');
        console.log('[useSwap] Base swap successful, tx:', txHash);
        return txHash;
      }

      // ─── SOLANA SWAP (unchanged) ───
      if (!walletAddress) {
        setError('Wallet not connected');
        setStatus('error');
        return null;
      }

      // Step 1: Build unsigned transaction server-side
      setStatus('signing');
      const { swapTransaction } = await apiService.post<{
        swapTransaction: string;
        lastValidBlockHeight: number;
      }>('/wallet/swap', {
        quoteResponse: currentQuote.raw,
      });

      // Step 2: Get Privy wallet provider and sign
      const provider = await getWalletProvider();
      if (!provider) {
        throw new Error('Wallet provider not available. Please reconnect your wallet.');
      }

      setStatus('sending');

      // Decode the base64 transaction into a VersionedTransaction object
      const txBytes = base64ToUint8Array(swapTransaction);
      const transaction = VersionedTransaction.deserialize(txBytes);

      // Privy's embedded wallet provider requires a Connection object
      // to send the signed transaction via connection.sendRawTransaction()
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

      const { signature } = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          transaction,
          connection,
        },
      });

      setStatus('success');
      console.log('[useSwap] Swap successful, signature:', signature);
      return signature;
    } catch (err: any) {
      const message = err?.message || 'Swap failed';
      setError(message);
      setStatus('error');
      console.warn('[useSwap] Swap error:', message);
      return null;
    }
  }, [chain, walletAddress, getWalletProvider, auth]);

  return {
    quote,
    status,
    error,
    fetchQuote,
    executeSwap,
    reset,
  };
}
