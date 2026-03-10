import { useInfiniteQuery } from '@tanstack/react-query';
import type { CommentsResponse } from '@momento/shared';
import { apiService } from '@/services/api';

/**
 * Fetch paginated comments for a post.
 */
export function useComments(postId: string | undefined) {
  return useInfiniteQuery<CommentsResponse>({
    queryKey: ['comments', postId],
    queryFn: ({ pageParam }) =>
      apiService.get<CommentsResponse>(`/posts/${postId}/comments`, {
        cursor: pageParam as string | undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!postId,
  });
}
