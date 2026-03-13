import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type {
  LikeResponse,
  PostWithCreator,
  FeedResponse,
} from '@momento/shared';
import { apiService } from '@/services/api';

/**
 * Like / unlike mutation with optimistic updates across:
 * - Individual post detail query
 * - All pages of the infinite feed query
 *
 * Also triggers haptic feedback on success.
 */
export function useLike() {
  const queryClient = useQueryClient();

  return useMutation<LikeResponse, Error, { postId: string; liked: boolean }>({
    mutationFn: ({ postId }) =>
      apiService.post<LikeResponse>(`/posts/${postId}/like`),

    onMutate: async ({ postId, liked }) => {
      // Cancel in-flight queries that would overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      await queryClient.cancelQueries({ queryKey: ['feed'] });

      // Snapshot previous values
      const previousPost = queryClient.getQueryData<PostWithCreator>([
        'post',
        postId,
      ]);
      const previousFeed = queryClient.getQueryData<InfiniteData<FeedResponse>>([
        'feed',
      ]);

      // Optimistic update — post detail
      if (previousPost) {
        queryClient.setQueryData<PostWithCreator>(['post', postId], {
          ...previousPost,
          isLiked: liked,
          likeCount: previousPost.likeCount + (liked ? 1 : -1),
        });
      }

      // Optimistic update — feed pages
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
                  ? {
                      ...post,
                      isLiked: liked,
                      likeCount: post.likeCount + (liked ? 1 : -1),
                    }
                  : post,
              ),
            })),
          };
        },
      );

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Silently ignore on simulator / unsupported devices
      });

      return { previousPost, previousFeed };
    },

    onError: (_err, { postId }, context) => {
      // Rollback
      if (context && 'previousPost' in context) {
        queryClient.setQueryData(
          ['post', postId],
          (context as { previousPost: PostWithCreator }).previousPost,
        );
      }
      if (context && 'previousFeed' in context) {
        queryClient.setQueriesData(
          { queryKey: ['feed'] },
          () =>
            (context as { previousFeed: InfiniteData<FeedResponse> })
              .previousFeed,
        );
      }
    },

    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
