import { useCallback, useRef, useState } from 'react';
import { useMutation, UseMutationResult } from '@tanstack/react-query';
import { buildTrade } from '@/services/tokenApi';
import type { TradeBuildResponse, TradeOrderRequest } from '@/services/tokenApi.types';
import type { ApiError } from '@/services/api';

/** Quotes go stale 30s after fetch (matches useSwap's QUOTE_MAX_AGE). */
const QUOTE_MAX_AGE_MS = 30_000;

interface UseTokenTradeQuote {
  /** Raw build mutation (build == quote — returns quote + unsigned tx in one call). */
  build: UseMutationResult<TradeBuildResponse, ApiError, TradeOrderRequest>;
  /** Convenience wrapper: returns the build response or null on error. */
  getQuote: (b: TradeOrderRequest) => Promise<TradeBuildResponse | null>;
  /** The most recent build response (quote + retained tx/intentId/idempotencyKey). */
  data: TradeBuildResponse | null;
  /** True when the held quote is older than the 30s TTL (re-quote before submit). */
  isStale: () => boolean;
}

/**
 * POSTs /tokens/[mint]/[side] to build a trade. §d.3 returns BOTH the quote AND
 * the unsigned transaction + intentId in one call — there is no separate quote
 * endpoint. The whole TradeBuildResponse is retained so the submit step can sign
 * the held tx; re-quote when isStale() before submitting.
 */
export function useTokenTradeQuote(
  mint: string,
  side: 'buy' | 'sell',
): UseTokenTradeQuote {
  const [data, setData] = useState<TradeBuildResponse | null>(null);
  const fetchedAtRef = useRef<number>(0);

  const build = useMutation<TradeBuildResponse, ApiError, TradeOrderRequest>({
    mutationFn: (body) => buildTrade(mint, side, body),
    onSuccess: (res) => {
      setData(res);
      fetchedAtRef.current = Date.now();
    },
  });

  const getQuote = useCallback(
    async (body: TradeOrderRequest): Promise<TradeBuildResponse | null> => {
      try {
        return await build.mutateAsync(body);
      } catch {
        // Error surfaced via build.error; caller decides UI.
        return null;
      }
    },
    [build],
  );

  const isStale = useCallback(
    () => !data || Date.now() - fetchedAtRef.current > QUOTE_MAX_AGE_MS,
    [data],
  );

  return { build, getQuote, data, isStale };
}
