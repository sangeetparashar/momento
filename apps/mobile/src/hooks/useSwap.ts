import { useState, useCallback, useRef } from 'react';
import { apiService } from '@/services/api';
import { useAuth } from './useAuth';

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
}

type SwapStatus = 'idle' | 'quoting' | 'signing' | 'sending' | 'confirming' | 'success' | 'error';

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
 * Hook for fetching Jupiter swap quotes and executing swaps
 * via the Privy embedded wallet.
 *
 * Flow:
 * 1. fetchQuote() → GET /api/wallet/swap → Jupiter quote with platform fee
 * 2. executeSwap() → POST /api/wallet/swap → unsigned tx → Privy signs & sends
 */
export function useSwap(): UseSwapReturn {
  const { walletAddress, getWalletProvider } = useAuth();
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const quoteRef = useRef<SwapQuote | null>(null);

  const reset = useCallback(() => {
    setQuote(null);
    setStatus('idle');
    setError(null);
    quoteRef.current = null;
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

        const queryParams: Record<string, string> = {
          amount: params.amount,
        };
        if (params.inputMint) queryParams.inputMint = params.inputMint;
        if (params.outputMint) queryParams.outputMint = params.outputMint;
        if (params.slippageBps) queryParams.slippageBps = params.slippageBps.toString();

        const response = await apiService.get<SwapQuote>('/wallet/swap', queryParams);
        setQuote(response);
        quoteRef.current = response;
        setStatus('idle');
        return response;
      } catch (err: any) {
        const message = err?.message || 'Failed to fetch quote';
        setError(message);
        setStatus('error');
        console.error('[useSwap] Quote error:', message);
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

    if (!walletAddress) {
      setError('Wallet not connected');
      setStatus('error');
      return null;
    }

    try {
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

      // Decode the base64 transaction and sign+send via Privy
      // The provider handles VersionedTransaction serialization
      const { signature } = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          transaction: swapTransaction,
        },
      });

      setStatus('success');
      console.log('[useSwap] Swap successful, signature:', signature);
      return signature;
    } catch (err: any) {
      const message = err?.message || 'Swap failed';
      setError(message);
      setStatus('error');
      console.error('[useSwap] Swap error:', message);
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
