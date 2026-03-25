import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { OnrampProvider, OnrampCoin, OnrampUrlResponse } from '@momento/shared';

export type { OnrampProvider, OnrampCoin };

/**
 * Fetches a fiat onramp URL from the API.
 * Only fetches when `enabled` is true (i.e. when the modal is open).
 */
export function useOnramp(
  provider: OnrampProvider = 'transak',
  coin: OnrampCoin = 'USDC',
  enabled = false
) {
  return useQuery<OnrampUrlResponse>({
    queryKey: ['onramp', provider, coin],
    queryFn: () =>
      apiService.get<OnrampUrlResponse>('/wallet/onramp', { provider, coin }),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
