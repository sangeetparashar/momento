import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { listVesting } from '@/services/tokenApi';
import type { VestingListItem } from '@/services/tokenApi.types';
import { useAuth } from './useAuth';

/**
 * Vesting schedules for the current user, optionally filtered by role/mint.
 * Account-scoped key (includes user id) so cached data doesn't bleed across
 * accounts after logout/login.
 */
export function useVestingList(
  role?: 'recipient' | 'sender',
  mint?: string,
): UseQueryResult<VestingListItem[]> {
  const { user } = useAuth();

  return useQuery<VestingListItem[]>({
    queryKey: ['vesting', user?.id, role ?? null, mint ?? null],
    queryFn: () =>
      listVesting({
        ...(role ? { role } : {}),
        ...(mint ? { mint } : {}),
      }),
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}
