import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  Share,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { LikeButton, TickerBanner, BookmarkButton, FeedSkeleton } from '@/components/features';
import { useFeed } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatNumber } from '@/utils/formatters';
import { DUMMY_TRENDING_TOKENS, DUMMY_CREATORS_TO_WATCH } from '@momento/shared';
import type { PostWithCreator } from '@momento/shared';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// TickerBanner data
const TRENDING_ITEMS = DUMMY_TRENDING_TOKENS.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

const CREATORS_ITEMS = DUMMY_CREATORS_TO_WATCH.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

// Reserve space for header + tickers + tab bar
const HEADER_HEIGHT = 44;
const TICKER_HEIGHT = 72; // approx height for 2 ticker banners
const TAB_BAR_HEIGHT = 80;
const PAGE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - TICKER_HEIGHT - TAB_BAR_HEIGHT;

function FeedPage({ post }: { post: PostWithCreator }) {
  const router = useRouter();

  const handleCreatorPress = useCallback(() => {
    router.push(`/creator/${post.creatorId}`);
  }, [post.creatorId, router]);

  const handlePostPress = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [post.id, router]);

  const handleShare = useCallback(() => {
    Share.share({
      message: post.caption || post.content || 'Check out this post on Momento',
    }).catch(() => {});
  }, [post.caption, post.content]);

  return (
    <View style={[styles.page, { width: SCREEN_WIDTH }]}>
      {/* Full-screen media — contain to show full image */}
      <Pressable onPress={handlePostPress} style={styles.mediaContainer}>
        {post.mediaUrl ? (
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.fullImage}
            contentFit="contain"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        ) : (
          <View style={styles.textPostContainer}>
            <Text style={styles.textPostContent} numberOfLines={12}>
              {post.content}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Right-side action buttons (TikTok-style) */}
      <View style={styles.actionsColumn}>
        <View style={styles.actionItem}>
          <LikeButton
            postId={post.id}
            initialLiked={post.isLiked}
            initialCount={post.likeCount}
          />
        </View>

        <Pressable onPress={handlePostPress} style={styles.actionItem}>
          <Ionicons name="chatbubble" size={26} color={COLORS.textPrimary} />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>
              {formatNumber(post.commentCount)}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={handleShare} style={styles.actionItem}>
          <Ionicons name="paper-plane" size={26} color={COLORS.textPrimary} />
        </Pressable>

        <View style={styles.actionItem}>
          <BookmarkButton postId={post.id} initialSaved={post.isSaved} size={26} />
        </View>
      </View>

      {/* Bottom overlay: creator info + caption */}
      <View style={styles.bottomOverlay}>
        <Pressable onPress={handleCreatorPress} style={styles.creatorRow}>
          <Avatar
            uri={post.creator.avatarUrl}
            name={post.creator.displayName || post.creator.username || '?'}
            size="sm"
          />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {post.creator.displayName || post.creator.username || 'Creator'}
            </Text>
            {post.creator.tokenSymbol && (
              <Text style={styles.tokenSymbol}>${post.creator.tokenSymbol}</Text>
            )}
          </View>
          <Text style={styles.timeAgo}>{formatTimeAgo(post.createdAt)}</Text>
        </Pressable>

        {post.caption ? (
          <Text style={styles.caption} numberOfLines={3}>
            {post.caption}
          </Text>
        ) : null}

        {post.distanceMeters != null && (
          <Text style={styles.distance}>
            {post.distanceMeters < 1000
              ? `${Math.round(post.distanceMeters)}m away`
              : `${(post.distanceMeters / 1000).toFixed(1)}km away`}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const feedQuery = useFeed();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const posts = useMemo(() => {
    if (!feedQuery.data?.pages) return [];
    return feedQuery.data.pages.flatMap((page) => page.posts);
  }, [feedQuery.data]);

  const handleEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const handleRefresh = useCallback(() => {
    feedQuery.refetch();
  }, [feedQuery]);

  const handleTickerPress = useCallback(() => {
    router.push('/market');
  }, [router]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: PostWithCreator }) => <FeedPage post={item} />,
    []
  );

  const keyExtractor = useCallback(
    (item: PostWithCreator) => item.id,
    []
  );

  if (feedQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.logo}>M O M E N T O</Text>
        </View>
        <FeedSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Compact header */}
      <View style={styles.header}>
        <Text style={styles.logo}>M O M E N T O</Text>
        <Pressable onPress={handleRefresh} style={styles.refreshButton} hitSlop={8}>
          {feedQuery.isRefetching ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={COLORS.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Ticker Banners */}
      <View style={styles.tickerSection}>
        <TickerBanner
          title="TRENDING"
          items={TRENDING_ITEMS}
          onPress={handleTickerPress}
        />
        <TickerBanner
          title="CREATORS TO WATCH"
          items={CREATORS_ITEMS}
          onPress={handleTickerPress}
        />
      </View>

      {posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No posts yet</Text>
          <Text style={styles.emptySubtext}>
            Follow creators to see their posts here
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={flatListRef}
            data={posts}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={5}
          />

          {/* Page indicator */}
          <View style={styles.pageIndicator}>
            <Text style={styles.pageText}>
              {currentIndex + 1} / {posts.length}
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  logo: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    letterSpacing: 4,
    fontWeight: '800',
    fontSize: 14,
  },
  refreshButton: {
    position: 'absolute',
    right: SPACING.md,
    padding: SPACING.xs,
  },

  // Ticker banners
  tickerSection: {
    paddingBottom: SPACING.xs,
  },

  // Feed page
  page: {
    height: PAGE_HEIGHT,
    position: 'relative',
    backgroundColor: COLORS.background,
  },
  mediaContainer: {
    flex: 1,
  },
  fullImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
  },
  textPostContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.surface,
  },
  textPostContent: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    lineHeight: 34,
  },

  // Right-side actions (TikTok style)
  actionsColumn: {
    position: 'absolute',
    right: SPACING.md,
    bottom: 160,
    alignItems: 'center',
    gap: SPACING.lg + 4,
  },
  actionItem: {
    alignItems: 'center',
    gap: 2,
  },
  actionCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 11,
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 70,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xl,
    backgroundColor: 'transparent',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  creatorInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  creatorName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tokenSymbol: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeAgo: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: SPACING.xs,
  },
  distance: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Page indicator
  pageIndicator: {
    position: 'absolute',
    top: HEADER_HEIGHT + TICKER_HEIGHT + SPACING.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.full,
  },
  pageText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  emptySubtext: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
});
