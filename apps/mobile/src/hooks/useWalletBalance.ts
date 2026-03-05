import { useQuery } from '@tanstack/react-query';
import type { WalletBalance } from '@momento/shared';
import { apiService } from '@/services/api';

/**
 * Polls the user's wallet balance every 30 seconds.
 */
export function useWalletBalance(enabled = true) {
  return useQuery<WalletBalance>({
    queryKey: ['walletBalance'],
    queryFn: () => apiService.get<WalletBalance>('/wallet/balance'),
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
