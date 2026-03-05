import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PublicCreator, FollowResponse } from '@momento/shared';
import { apiService } from '@/services/api';

interface CreatorProfileResponse extends PublicCreator {
  isFollowing: boolean;
}

/**
 * Fetch a creator's public profile and provide an optimistic follow/unfollow
 * mutation.
 */
export function useCreatorProfile(creatorId: string | undefined) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery<CreatorProfileResponse>({
    queryKey: ['creator', creatorId],
    queryFn: () =>
      apiService.get<CreatorProfileResponse>(`/creators/${creatorId}`),
    enabled: !!creatorId,
  });

  const followMutation = useMutation<
    FollowResponse,
    Error,
    { creatorId: string; follow: boolean }
  >({
    mutationFn: ({ creatorId: id, follow }) =>
      follow
        ? apiService.post<FollowResponse>(`/creators/${id}/follow`)
        : apiService.delete<FollowResponse>(`/creators/${id}/follow`),

    // Optimistic update
    onMutate: async ({ creatorId: id, follow }) => {
      await queryClient.cancelQueries({ queryKey: ['creator', id] });

      const previous = queryClient.getQueryData<CreatorProfileResponse>([
        'creator',
        id,
      ]);

      if (previous) {
        queryClient.setQueryData<CreatorProfileResponse>(['creator', id], {
          ...previous,
          isFollowing: follow,
          followerCount: previous.followerCount + (follow ? 1 : -1),
        });
      }

      return { previous };
    },

    onError: (_err, { creatorId: id }, context) => {
      // Roll back on failure
      if (context && 'previous' in context) {
        queryClient.setQueryData(
          ['creator', id],
          (context as { previous: CreatorProfileResponse }).previous,
        );
      }
    },

    onSettled: (_data, _err, { creatorId: id }) => {
      queryClient.invalidateQueries({ queryKey: ['creator', id] });
    },
  });

  const toggleFollow = () => {
    if (!creatorId || !profileQuery.data) return;
    followMutation.mutate({
      creatorId,
      follow: !profileQuery.data.isFollowing,
    });
  };

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    isFollowing: profileQuery.data?.isFollowing ?? false,
    toggleFollow,
    isFollowLoading: followMutation.isPending,
  };
}
