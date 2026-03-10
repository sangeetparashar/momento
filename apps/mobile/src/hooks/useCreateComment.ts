import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Comment } from '@momento/shared';
import { apiService } from '@/services/api';

/**
 * Create a comment on a post. Invalidates comments, post detail,
 * and feed queries on success to update comment counts.
 */
export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation<Comment, Error, string>({
    mutationFn: (content: string) =>
      apiService.post<Comment>(`/posts/${postId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
