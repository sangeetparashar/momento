import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { ChainType, OnrampProvider, OnrampUrlResponse } from '@momento/shared';

export type { OnrampProvider };

interface UseOnrampOptions {
  provider?: OnrampProvider;
  chain?: ChainType;
  enabled?: boolean;
}

/**
 * Fetches a fiat onramp URL from the API for the selected chain.
 * Defaults to USDC on Solana when no chain is provided (back-compat).
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
  const chain: ChainType = opts.chain ?? 'solana';
  const enabled = opts.enabled ?? false;

  return useQuery<OnrampUrlResponse>({
    queryKey: ['onramp', provider, chain],
    queryFn: () =>
      apiService.get<OnrampUrlResponse>('/wallet/onramp', { provider, chain }),
    enabled,
    staleTime: 0, // Always fetch fresh — widget URLs are single-use/time-limited
    gcTime: 0,
    retry: 2,
  });
}
