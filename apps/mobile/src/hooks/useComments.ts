import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { Comment } from '@momento/shared';

interface CommentsResponse {
  comments: Comment[];
  nextCursor?: string;
  hasMore: boolean;
}

export function useComments(postId: string | undefined) {
  const queryClient = useQueryClient();

  const commentsQuery = useInfiniteQuery<CommentsResponse>({
    queryKey: ['post', postId, 'comments'],
    queryFn: ({ pageParam }) =>
      apiService.get<CommentsResponse>(`/posts/${postId}/comments`, {
        ...(pageParam ? { cursor: pageParam as string } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!postId,
  });

  const createComment = useMutation<Comment, Error, { content: string }>({
    mutationFn: ({ content }) =>
      apiService.post<Comment>(`/posts/${postId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'comments'] });
      // Also update comment count in feed cache
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const comments = commentsQuery.data?.pages.flatMap((p) => p.comments) ?? [];

  return {
    comments,
    isLoading: commentsQuery.isLoading,
    hasMore: commentsQuery.hasNextPage ?? false,
    fetchMore: commentsQuery.fetchNextPage,
    isFetchingMore: commentsQuery.isFetchingNextPage,
    createComment: createComment.mutate,
    isCreating: createComment.isPending,
    refetch: commentsQuery.refetch,
  };
}
