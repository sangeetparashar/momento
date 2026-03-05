import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { LikeButton } from './LikeButton';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatNumber } from '@/utils/formatters';
import type { PostWithCreator } from '@momento/shared';

interface PostCardProps {
  post: PostWithCreator;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_WIDTH;

export function PostCard({ post }: PostCardProps) {
  const router = useRouter();

  const handleImagePress = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [post.id, router]);

  const handleCreatorPress = useCallback(() => {
    router.push(`/creator/${post.creatorId}`);
  }, [post.creatorId, router]);

  return (
    <View style={styles.container}>
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
      {post.mediaUrl && (
        <Pressable onPress={handleImagePress}>
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        </Pressable>
      )}

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
        <Pressable style={styles.shareButton}>
          <Ionicons
            name="paper-plane-outline"
            size={22}
            color={COLORS.textSecondary}
          />
        </Pressable>
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
    </View>
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
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: COLORS.surface,
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
});
