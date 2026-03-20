import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostWithCreator, PostType } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';
import { showErrorToast } from '@/utils/toast';

interface CreatePostInput {
  postType: PostType;
  content?: string;
  caption?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
}

/**
 * Create a new post. Automatically injects the user's current location.
 * Invalidates the feed on success.
 */
export function useCreatePost() {
  const queryClient = useQueryClient();
  const { location } = useLocation();

  return useMutation<PostWithCreator, Error, CreatePostInput>({
    mutationFn: (input) => {
      if (!location) {
        return Promise.reject(
          new Error('Location is required to create a post.'),
        );
      }

      return apiService.post<PostWithCreator>('/posts', {
        ...input,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    },

    onSuccess: () => {
      // Refresh the feed, profile (post count), and creator posts grid
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['creator'] });
    },
    onError: () => {
      showErrorToast('Failed to create post. Please try again.');
    },
  });
}
