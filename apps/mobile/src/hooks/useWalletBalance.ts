import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { WalletBalance } from '@momento/shared';
import { apiService } from '@/services/api';

/**
 * Polls the user's wallet balance every 30 seconds.
 * Pauses polling when the app is backgrounded to save battery and data.
 */
export function useWalletBalance(enabled = true) {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  return useQuery<WalletBalance>({
    queryKey: ['walletBalance'],
    queryFn: () => apiService.get<WalletBalance>('/wallet/balance'),
    enabled,
    refetchInterval: isActive ? 30_000 : false,
    staleTime: 15_000,
  });
}
