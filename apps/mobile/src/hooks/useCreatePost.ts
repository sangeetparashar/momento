import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Post, PostType } from '@momento/shared';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';

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

  return useMutation<Post, Error, CreatePostInput>({
    mutationFn: (input) => {
      if (!location) {
        return Promise.reject(
          new Error('Location is required to create a post.'),
        );
      }

      return apiService.post<Post>('/posts', {
        ...input,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    },

    onSuccess: () => {
      // Refresh the feed and the user's profile (post count)
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}
