import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@momento/shared';
import { apiService } from '@/services/api';

type UpdateProfilePayload = Partial<
  Pick<
    User,
    'username' | 'displayName' | 'bio' | 'avatarUrl' | 'bannerUrl' | 'socialLinks'
  >
>;

/**
 * Fetch the authenticated user's profile and provide an update mutation.
 */
export function useUserProfile(enabled = true) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery<User>({
    queryKey: ['userProfile'],
    queryFn: () => apiService.get<User>('/users/me'),
    enabled,
  });

  const updateMutation = useMutation<User, Error, UpdateProfilePayload>({
    mutationFn: (payload) =>
      apiService.patch<User>('/users/me', payload),

    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['userProfile'] });

      const previous = queryClient.getQueryData<User>(['userProfile']);

      if (previous) {
        queryClient.setQueryData<User>(['userProfile'], {
          ...previous,
          ...payload,
        });
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context && 'previous' in context) {
        queryClient.setQueryData(
          ['userProfile'],
          (context as { previous: User }).previous,
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });

  return {
    user: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    refetch: profileQuery.refetch,
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
