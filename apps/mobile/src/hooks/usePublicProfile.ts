import { useQuery } from '@tanstack/react-query';
import type { PublicCreator } from '@momento/shared';
import { apiService } from '@/services/api';

export interface PublicProfile {
  id: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  tokenSymbol?: string;
  socialLinks?: Record<string, string | undefined>;
  role: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  createdAt?: string;
}

/**
 * Fetch any user's public profile by ID.
 * Works for both regular users and creators.
 */
export function usePublicProfile(userId: string | undefined) {
  const profileQuery = useQuery<PublicProfile>({
    queryKey: ['userProfile', userId],
    queryFn: () => apiService.get<PublicProfile>(`/users/${userId}`),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
  };
}
