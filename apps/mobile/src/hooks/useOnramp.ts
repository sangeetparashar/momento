import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { OnrampProvider, OnrampUrlResponse } from '@momento/shared';

export type { OnrampProvider };

/**
 * Fetches a fiat onramp URL from the API.
 * Always targets USDC on Solana.
 * Only fetches when `enabled` is true (i.e. when the modal is open).
 */
export function useOnramp(provider: OnrampProvider = 'ramp', enabled = false) {
  return useQuery<OnrampUrlResponse>({
    queryKey: ['onramp', provider],
    queryFn: () =>
      apiService.get<OnrampUrlResponse>('/wallet/onramp', { provider }),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
