import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, Share, useWindowDimensions } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, AnimatedPressable, MediaImage } from '@/components/primitives';
import { LikeButton } from './LikeButton';
import { BookmarkButton } from './BookmarkButton';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatNumber } from '@/utils/formatters';
import { PostType } from '@momento/shared';
import type { PostWithCreator } from '@momento/shared';

interface PostCardProps {
  post: PostWithCreator;
}

export function PostCard({ post }: PostCardProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const IMAGE_HEIGHT = SCREEN_WIDTH;
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const [isMuted, setIsMuted] = useState(true);
  const isVideo = post.postType === PostType.VIDEO;
  const hasImage = !isVideo && !!post.mediaUrl;

  const videoPlayer = useVideoPlayer(
    isVideo && post.mediaUrl ? post.mediaUrl : null,
    (player) => {
      player.loop = true;
      player.muted = true;
      player.play();
    },
  );

  useEffect(() => {
    if (videoPlayer) videoPlayer.muted = isMuted;
  }, [isMuted, videoPlayer]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  const handleImagePress = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [post.id, router]);

  const handleCreatorPress = useCallback(() => {
    router.push(`/creator/${post.creatorId}`);
  }, [post.creatorId, router]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* Creator Info Header */}
      <Pressable onPress={handleCreatorPress} style={styles.header}>
        <Avatar
          uri={post.creator.avatarUrl}
          name={post.creator.displayName || post.creator.username}
          size="sm"
        />
        <View style={styles.headerText}>
          <Text style={styles.displayName}>
            {post.creator.displayName || post.creator.username || 'Creator'}
          </Text>
          {post.creator.tokenSymbol && (
            <Text style={styles.tokenSymbol}>${post.creator.tokenSymbol}</Text>
          )}
        </View>
        <Text style={styles.timeAgo}>{formatTimeAgo(post.createdAt)}</Text>
      </Pressable>

      {/* Post Media */}
      {post.mediaUrl && isVideo ? (
        <Pressable onPress={handleImagePress} style={styles.videoContainer}>
          <VideoView
            player={videoPlayer}
            style={styles.image}
            contentFit="cover"
            nativeControls={false}
          />
          <Pressable
            style={styles.soundButton}
            onPress={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }}
            hitSlop={8}
          >
            <Ionicons
              name={isMuted ? 'volume-mute' : 'volume-high'}
              size={18}
              color="#FFFFFF"
            />
          </Pressable>
        </Pressable>
      ) : hasImage ? (
        <AnimatedPressable onPress={handleImagePress} scaleValue={0.98}>
          <MediaImage
            uri={post.mediaUrl}
            style={styles.image}
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        </AnimatedPressable>
      ) : post.content ? (
        <View style={styles.textContentContainer}>
          <Text style={styles.textContent}>{post.content}</Text>
        </View>
      ) : null}

      {/* Actions Row */}
      <View style={styles.actionsRow}>
        <LikeButton
          postId={post.id}
          initialLiked={post.isLiked}
          initialCount={post.likeCount}
        />
        <Pressable onPress={handleImagePress} style={styles.commentButton}>
          <Ionicons
            name="chatbubble-outline"
            size={22}
            color={COLORS.textSecondary}
          />
          {post.commentCount > 0 && (
            <Text style={styles.commentCount}>
              {formatNumber(post.commentCount)}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={styles.shareButton}
          onPress={() => {
            Share.share({
              message: post.caption || post.content || 'Check out this post on Momento',
            }).catch(() => {});
          }}
        >
          <Ionicons
            name="paper-plane-outline"
            size={22}
            color={COLORS.textSecondary}
          />
        </Pressable>
        <BookmarkButton postId={post.id} initialSaved={post.isSaved} />
      </View>

      {/* Caption */}
      {post.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.captionName}>
            {post.creator.displayName || post.creator.username}{' '}
          </Text>
          <Text style={styles.captionText}>{post.caption}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerText: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  displayName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  tokenSymbol: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  timeAgo: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  image: {
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
  soundButton: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentCount: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  shareButton: {
    marginLeft: 'auto',
  },
  captionContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    flexWrap: 'wrap',
  },
  captionName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  captionText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    flex: 1,
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
