import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { LikeButton, PostDetailSkeleton } from '@/components/features';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatDistance } from '@/utils/formatters';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFeed, useComments, useUserProfile } from '@/hooks';
import { apiService } from '@/services/api';
import { PostType } from '@momento/shared';
import type { PostWithCreator } from '@momento/shared';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const feedQuery = useFeed();
  const { user } = useUserProfile();
  const [commentText, setCommentText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<Video>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { comments, isLoading: commentsLoading, createComment, isCreating } = useComments(id);

  const deleteMutation = useMutation({
    mutationFn: () => apiService.delete(`/posts/${id}`),
    onSuccess: () => {
      // Navigate back FIRST to prevent the unmounted post query from refetching
      router.back();
      // Then clean up caches in the background (no await — screen is already gone)
      queryClient.removeQueries({ queryKey: ['post', id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['creator'] });
    },
  });

  // Find the post from feed data
  const cachedPost = useMemo(() => {
    if (!feedQuery.data?.pages) return undefined;
    for (const page of feedQuery.data.pages) {
      const found = page.posts.find((p) => p.id === id);
      if (found) return found;
    }
    return undefined;
  }, [feedQuery.data, id]);

  // Fallback: fetch directly from API if not in feed cache
  const postQuery = useQuery<PostWithCreator>({
    queryKey: ['post', id],
    queryFn: () => apiService.get<PostWithCreator>(`/posts/${id}`),
    enabled: !!id && !cachedPost,
  });

  const post = cachedPost ?? postQuery.data;
  const isPostLoading = !cachedPost && postQuery.isLoading;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleCreatorPress = useCallback(() => {
    if (post?.creatorId) {
      router.push(`/creator/${post.creatorId}`);
    }
  }, [post?.creatorId, router]);

  const handleSendComment = useCallback(() => {
    if (!commentText.trim() || !id) return;
    createComment({ content: commentText.trim() });
    setCommentText('');
    inputRef.current?.blur();
  }, [commentText, id, createComment]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }, [deleteMutation]);

  const isOwner = user?.id === post?.creatorId;
  const isVideo = post?.postType === PostType.VIDEO;

  if (isPostLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <Ionicons
              name="chevron-back"
              size={28}
              color={COLORS.textPrimary}
            />
          </Pressable>
        </View>
        <PostDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <Ionicons
              name="chevron-back"
              size={28}
              color={COLORS.textPrimary}
            />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Post not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Nav Bar */}
        <View style={styles.navBar}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <Ionicons
              name="chevron-back"
              size={28}
              color={COLORS.textPrimary}
            />
          </Pressable>
          <Text style={styles.navTitle}>Post</Text>
          {isOwner ? (
            <Pressable onPress={handleDelete} style={styles.backButton} hitSlop={8} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <Ionicons name="trash-outline" size={22} color={COLORS.error} />
              )}
            </Pressable>
          ) : (
            <View style={styles.navSpacer} />
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Creator Info */}
          <Pressable onPress={handleCreatorPress} style={styles.creatorRow}>
            <Avatar
              uri={post.creator.avatarUrl}
              name={post.creator.displayName || post.creator.username}
              size="md"
            />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>
                {post.creator.displayName || post.creator.username}
              </Text>
              <View style={styles.creatorMeta}>
                {post.creator.username && (
                  <Text style={styles.username}>
                    @{post.creator.username}
                  </Text>
                )}
                <Text style={styles.dot}>  </Text>
                <Text style={styles.timeAgo}>
                  {formatTimeAgo(post.createdAt)}
                </Text>
                {post.distanceMeters != null && (
                  <>
                    <Text style={styles.dot}>  </Text>
                    <Ionicons name="location-outline" size={12} color={COLORS.primary} />
                    <Text style={styles.distanceText}>
                      {formatDistance(post.distanceMeters)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Pressable>

          {/* Post Media */}
          {post.mediaUrl && isVideo ? (
            <View style={styles.videoContainer}>
              <Video
                ref={videoRef}
                source={{ uri: post.mediaUrl }}
                style={styles.postImage}
                resizeMode={ResizeMode.CONTAIN}
                isLooping
                shouldPlay={isPlaying}
                isMuted={isMuted}
              />
              {/* Play/Pause overlay */}
              <Pressable
                style={styles.videoOverlay}
                onPress={() => setIsPlaying((p) => !p)}
              >
                {!isPlaying && (
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={40} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
              {/* Sound toggle */}
              <Pressable
                style={styles.soundButton}
                onPress={() => setIsMuted((m) => !m)}
              >
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
          ) : post.mediaUrl ? (
            <Image
              source={{ uri: post.mediaUrl }}
              style={styles.postImage}
              contentFit="cover"
              transition={200}
            />
          ) : post.content ? (
            <View style={styles.textContentContainer}>
              <Text style={styles.textContent}>{post.content}</Text>
            </View>
          ) : null}

          {/* Caption */}
          {post.caption && (
            <View style={styles.captionContainer}>
              <Text style={styles.caption}>{post.caption}</Text>
            </View>
          )}

          {/* Like Button */}
          <View style={styles.actionsRow}>
            <LikeButton
              postId={post.id}
              initialLiked={post.isLiked}
              initialCount={post.likeCount}
              size={28}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Comments</Text>
            {commentsLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
            ) : comments.length === 0 ? (
              <Text style={styles.emptyComments}>No comments yet. Be the first!</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <Avatar
                    uri={comment.user.avatarUrl}
                    name={comment.user.displayName || comment.user.username}
                    size="sm"
                  />
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentName}>
                        {comment.user.displayName || comment.user.username}
                      </Text>
                      <Text style={styles.commentTime}>
                        {formatTimeAgo(comment.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{comment.content}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment Input */}
        <View style={[styles.commentInputContainer, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}>
          <TextInput
            ref={inputRef}
            style={styles.commentInput}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            placeholderTextColor={COLORS.textTertiary}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSendComment}
          />
          <Pressable
            onPress={handleSendComment}
            style={[
              styles.sendButton,
              (!commentText.trim() || isCreating) && styles.sendButtonDisabled,
            ]}
            disabled={!commentText.trim() || isCreating}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={
                  commentText.trim() ? COLORS.primary : COLORS.textTertiary
                }
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  backButton: {
    padding: SPACING.xs,
  },
  navTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
  },
  navSpacer: {
    width: 36,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  scrollContent: {
    paddingBottom: SPACING.md,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  creatorInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  creatorName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  creatorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
  dot: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
  timeAgo: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
  distanceText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  postImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: COLORS.surface,
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  soundButton: {
    position: 'absolute',
    bottom: SPACING.md,
    right: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  caption: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  actionsRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  commentsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  commentsTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginBottom: SPACING.md,
    fontSize: 18,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  commentContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  commentTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  commentText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  commentInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    fontSize: 15,
    maxHeight: 80,
  },
  sendButton: {
    marginLeft: SPACING.sm,
    padding: SPACING.xs,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyComments: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginVertical: SPACING.md,
  },
  textContentContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    minHeight: 120,
    justifyContent: 'center',
  },
  textContent: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
});
