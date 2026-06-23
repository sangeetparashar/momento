import { useState, useCallback, useRef } from 'react';
import { VersionedTransaction, Connection } from '@solana/web3.js';
import { apiService } from '@/services/api';
import { useAuth } from './useAuth';

const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

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
  chain?: 'solana';
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

/**
 * Hook for fetching swap quotes and executing swaps via the embedded wallet.
 *
 * Solana flow:
 * 1. fetchQuote() → GET /api/wallet/swap → Jupiter quote with platform fee
 * 2. executeSwap() → POST /api/wallet/swap → unsigned tx → Privy signs & sends
 */
export function useSwap(): UseSwapReturn {
  const auth = useAuth();
  const { walletAddress, getWalletProvider } = auth;
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

        // Solana / Jupiter quote
        queryParams.amount = params.amount;
        if (params.inputMint) queryParams.inputMint = params.inputMint;
        if (params.outputMint) queryParams.outputMint = params.outputMint;
        if (params.slippageBps) queryParams.slippageBps = params.slippageBps.toString();

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
    [],
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
  }, [walletAddress, getWalletProvider]);

  return {
    quote,
    status,
    error,
    fetchQuote,
    executeSwap,
    reset,
  };
}
