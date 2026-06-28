import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getTokenDetail } from '@/services/tokenApi';
import type { TokenDetailResponse } from '@/services/tokenApi.types';

/** Statuses where price/fundraise are still changing and worth polling. */
const LIVE_STATUSES = new Set(['ACTIVE', 'THRESHOLD_MET', 'FINALIZING']);

/**
 * Token detail (price, fundraise, fee config, creator). Polls every 20s while
 * the token is in a live status (ACTIVE / THRESHOLD_MET / FINALIZING) so
 * price/fundraise stay fresh through graduation; otherwise no interval.
 */
export function useTokenDetail(
  mint?: string,
): UseQueryResult<TokenDetailResponse> {
  return useQuery<TokenDetailResponse>({
    queryKey: ['tokenDetail', mint],
    queryFn: () => getTokenDetail(mint as string),
    enabled: !!mint,
    staleTime: 15_000,
    refetchInterval: (query) =>
      LIVE_STATUSES.has(query.state.data?.status ?? '') ? 20_000 : false,
  });
}
