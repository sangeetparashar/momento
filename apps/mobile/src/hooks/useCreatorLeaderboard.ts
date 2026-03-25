import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { CreatorLeaderboardResponse } from '@momento/shared';

export function useCreatorLeaderboard() {
  return useQuery<CreatorLeaderboardResponse>({
    queryKey: ['creatorLeaderboard'],
    queryFn: () => apiService.get<CreatorLeaderboardResponse>('/creators/leaderboard'),
    staleTime: 60_000,
  });
}
