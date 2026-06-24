import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getTokenTrades } from '@/services/tokenApi';
import type { TradeFeedItem } from '@/services/tokenApi.types';
import { ENV } from '@/config/env';

/**
 * Recent trades for a token. Best-effort feed — gated behind
 * ENV.FEES_FEED_ENABLED until the backend read route lands. Renders empty
 * (data === []) when disabled so screens stay functional.
 */
export function useTokenTrades(mint?: string): UseQueryResult<TradeFeedItem[]> {
  return useQuery<TradeFeedItem[]>({
    queryKey: ['tokenTrades', mint],
    queryFn: () => getTokenTrades(mint as string),
    enabled: !!mint && ENV.FEES_FEED_ENABLED,
    staleTime: 15_000,
  });
}
