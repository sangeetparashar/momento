import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getCreatorFees } from '@/services/tokenApi';
import type { CreatorFeesResponse } from '@/services/tokenApi.types';
import { ENV } from '@/config/env';

/**
 * Creator's aggregate claimable/claimed fee earnings. Best-effort — gated
 * behind ENV.FEES_FEED_ENABLED until the backend read route lands.
 */
export function useCreatorFees(
  creatorId?: string,
): UseQueryResult<CreatorFeesResponse> {
  return useQuery<CreatorFeesResponse>({
    queryKey: ['creatorFees', creatorId],
    queryFn: () => getCreatorFees(creatorId as string),
    enabled: !!creatorId && ENV.FEES_FEED_ENABLED,
    staleTime: 30_000,
  });
}
