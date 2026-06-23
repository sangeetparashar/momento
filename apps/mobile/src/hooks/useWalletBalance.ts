import { useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WalletBalance } from '@momento/shared';
import { apiService } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Polls the user's wallet balance.
 *
 * Normal mode: every 30 seconds.
 * After a swap/fund: every 10 seconds for 60s, then back to normal.
 * Pauses polling when the app is backgrounded.
 */
export function useWalletBalance(enabled = true) {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  const [fastPoll, setFastPoll] = useState(false);
  // Per-user query keys are required so cached data from a previous account
  // doesn't bleed through after logout/login. The user object comes from Privy.
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const query = useQuery<WalletBalance>({
    queryKey: ['walletBalance', userId, 'solana'],
    queryFn: () => apiService.get<WalletBalance>('/wallet/balance'),
    enabled,
    refetchInterval: isActive ? (fastPoll ? 10_000 : 30_000) : false,
    staleTime: fastPoll ? 5_000 : 15_000,
  });

  // Start aggressive polling (10s) — auto-reverts after 60s
  const startFastPolling = useCallback(() => {
    setFastPoll(true);
    // Also trigger an immediate refetch
    query.refetch();
    const timer = setTimeout(() => setFastPoll(false), 60_000);
    return () => clearTimeout(timer);
  }, [query]);

  return { ...query, startFastPolling };
}
