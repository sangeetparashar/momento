import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { OnrampProvider, OnrampUrlResponse } from '@momento/shared';

export type { OnrampProvider };

interface UseOnrampOptions {
  provider?: OnrampProvider;
  enabled?: boolean;
}

/**
 * Fetches a fiat onramp URL from the API for USDC on Solana.
 * Only fetches when `enabled` is true (i.e. when the modal is open).
 *
 * Backwards compatible: also accepts the legacy `(provider, enabled)` positional form.
 */
export function useOnramp(
  optionsOrProvider: UseOnrampOptions | OnrampProvider = 'ramp',
  legacyEnabled = false,
) {
  const opts: UseOnrampOptions =
    typeof optionsOrProvider === 'string'
      ? { provider: optionsOrProvider, enabled: legacyEnabled }
      : optionsOrProvider;

  const provider: OnrampProvider = opts.provider ?? 'ramp';
  const enabled = opts.enabled ?? false;

  return useQuery<OnrampUrlResponse>({
    queryKey: ['onramp', provider, 'solana'],
    queryFn: () =>
      apiService.get<OnrampUrlResponse>('/wallet/onramp', { provider }),
    enabled,
    staleTime: 0, // Always fetch fresh — widget URLs are single-use/time-limited
    gcTime: 0,
    retry: 2,
  });
}
