import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getTokenFees } from '@/services/tokenApi';
import type { TokenFeesResponse } from '@/services/tokenApi.types';
import { ENV } from '@/config/env';

/**
 * Per-token fee/rebate totals. Best-effort — gated behind ENV.FEES_FEED_ENABLED
 * until the backend read route lands.
 */
export function useTokenFees(mint?: string): UseQueryResult<TokenFeesResponse> {
  return useQuery<TokenFeesResponse>({
    queryKey: ['tokenFees', mint],
    queryFn: () => getTokenFees(mint as string),
    enabled: !!mint && ENV.FEES_FEED_ENABLED,
    staleTime: 30_000,
  });
}
