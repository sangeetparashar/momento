import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { PostWithCreator } from '@momento/shared';

interface SavedPostsResponse {
  posts: PostWithCreator[];
  nextCursor?: string;
  hasMore: boolean;
}

export function useSavedPosts() {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery<SavedPostsResponse>({
    queryKey: ['savedPosts'],
    queryFn: ({ pageParam }) =>
      apiService.get<SavedPostsResponse>('/users/me/saved', {
        ...(pageParam ? { cursor: pageParam as string } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
  });

  const toggleSave = useMutation<{ saved: boolean }, Error, { postId: string }>({
    mutationFn: ({ postId }) =>
      apiService.post<{ saved: boolean }>('/users/me/saved', { postId }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['savedPosts'] });
    },
  });

  const posts = query.data?.pages.flatMap((p) => p.posts) ?? [];

  return {
    posts,
    isLoading: query.isLoading,
    hasMore: query.hasNextPage ?? false,
    fetchMore: query.fetchNextPage,
    isFetchingMore: query.isFetchingNextPage,
    toggleSave: toggleSave.mutate,
    isToggling: toggleSave.isPending,
    refetch: query.refetch,
  };
}
