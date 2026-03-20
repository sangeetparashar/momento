import { useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { Comment, FeedResponse, CommentsResponse } from '@momento/shared';
import { showErrorToast } from '@/utils/toast';

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
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      // Surgically update commentCount in feed cache instead of invalidating all pages
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: ['feed'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.id === postId
                  ? { ...post, commentCount: post.commentCount + 1 }
                  : post,
              ),
            })),
          };
        },
      );
    },
    onError: () => {
      showErrorToast('Failed to post comment.');
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
