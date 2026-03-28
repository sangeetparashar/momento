import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  Share,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, MomentoLogo, CoachMark } from '@/components/primitives';
import { LikeButton, TickerBanner, BookmarkButton, FeedSkeleton, FeedAlgorithmModal, SwipeIndicator, FundWalletModal, ComingSoonModal } from '@/components/features';
import { useFeed, useCreatorLeaderboard } from '@/hooks';
import { useMutation } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import { useNotifications } from '@/providers/NotificationProvider';
import type { FeedSortMode } from '@/hooks/useFeed';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatNumber } from '@/utils/formatters';
import { PostType } from '@momento/shared';
import type { PostWithCreator } from '@momento/shared';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

function isVideoPost(post: PostWithCreator): boolean {
  if (post.postType === PostType.VIDEO) return true;
  if (post.mediaUrl) {
    const url = post.mediaUrl.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => url.endsWith(ext));
  }
  return false;
}

// Reserve space for header + tickers + tab bar
const HEADER_HEIGHT = 44;
const TICKER_HEIGHT = 72; // approx height for 2 ticker banners
const TAB_BAR_HEIGHT = 80;
const ACTION_BAR_HEIGHT = 52; // caption + action icons (NOT overlaid on media)
const CREATOR_BAR_HEIGHT = 72; // creator info section at bottom

const SORT_ICONS: Record<FeedSortMode, keyof typeof Ionicons.glyphMap> = {
  smart: 'sparkles',
  recent: 'time-outline',
  popular: 'flame-outline',
  nearby: 'location-outline',
  following: 'people-outline',
};

const FeedPage = React.memo(function FeedPage({ post, screenWidth, pageHeight, isVisible }: { post: PostWithCreator; screenWidth: number; pageHeight: number; isVisible: boolean }) {
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFollowing, setIsFollowing] = useState(post.creator.isFollowing ?? false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const isVideo = isVideoPost(post);

  const followMutation = useMutation({
    mutationFn: () => apiService.post(`/creators/${post.creatorId}/follow`),
    onMutate: () => setIsFollowing((prev) => !prev),
    onError: () => setIsFollowing((prev) => !prev),
  });

  // Unload video memory when scrolling offscreen to prevent memory buildup
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (!isVisible) {
      videoRef.current.stopAsync().catch(() => {});
      videoRef.current.unloadAsync().catch(() => {});
    } else {
      videoRef.current.loadAsync({ uri: post.mediaUrl! }, { shouldPlay: true, isMuted, isLooping: true }).catch(() => {});
    }
  }, [isVisible, isVideo, post.mediaUrl, isMuted]);

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

  const handleVideoTap = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  return (
    <View style={[styles.page, { width: screenWidth, height: pageHeight }]}>
      {/* ── Media area — flex:1 fills remaining space, NO overlays on native views ── */}
      <Pressable
        onPress={isVideo ? handleVideoTap : handlePostPress}
        style={styles.mediaSection}
      >
        {post.mediaUrl && isVideo ? (
          <Video
            ref={videoRef}
            source={{ uri: post.mediaUrl }}
            style={styles.fullImage}
            shouldPlay={isVisible && isPlaying}
            isMuted={isMuted}
            isLooping
            resizeMode={ResizeMode.CONTAIN}
          />
        ) : post.mediaUrl ? (
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.fullImage}
            contentFit="contain"
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
            cachePolicy="disk"
            recyclingKey={post.mediaUrl}
          />
        ) : (
          <View style={styles.textPostContainer}>
            <Text style={styles.textPostContent} numberOfLines={12}>
              {post.content}
            </Text>
          </View>
        )}
      </Pressable>

      {/* ── Action bar — caption + actions, BELOW media (no z-order issues) ── */}
      <View style={styles.actionBar}>
        <View style={styles.actionBarLeft}>
          {post.caption ? (
            <Text style={styles.actionBarCaption} numberOfLines={1}>{post.caption}</Text>
          ) : null}
          {post.distanceMeters != null && (
            <Text style={styles.actionBarDistance}>
              {post.distanceMeters < 1000
                ? `${Math.round(post.distanceMeters)}m away`
                : `${(post.distanceMeters / 1000).toFixed(1)}km away`}
            </Text>
          )}
        </View>
        <View style={styles.actionBarRight}>
          {isVideo && post.mediaUrl && (
            <Pressable onPress={handleMuteToggle} style={styles.actionBarIcon} hitSlop={8}>
              <Ionicons
                name={isMuted ? 'volume-mute' : 'volume-high'}
                size={20}
                color={COLORS.textSecondary}
              />
            </Pressable>
          )}
          <View style={styles.actionBarIcon}>
            <LikeButton
              postId={post.id}
              initialLiked={post.isLiked}
              initialCount={post.likeCount}
              size={20}
            />
          </View>
          <Pressable onPress={handlePostPress} style={styles.actionBarIcon}>
            <Ionicons name="chatbubble-outline" size={20} color={COLORS.textSecondary} />
            {post.commentCount > 0 && (
              <Text style={styles.actionBarCount}>{formatNumber(post.commentCount)}</Text>
            )}
          </Pressable>
          <Pressable onPress={handleShare} style={styles.actionBarIcon}>
            <Ionicons name="paper-plane-outline" size={20} color={COLORS.textSecondary} />
          </Pressable>
          <View style={styles.actionBarIcon}>
            <BookmarkButton postId={post.id} initialSaved={post.isSaved} size={20} />
          </View>
        </View>
      </View>

      {/* ── Creator info bar (bottom, NOT overlaid) ── */}
      <View style={styles.creatorSection}>
        <Pressable onPress={handleCreatorPress} style={styles.creatorBarLeft}>
          <Avatar
            uri={post.creator.avatarUrl}
            name={post.creator.displayName || post.creator.username || '?'}
            size="sm"
          />
          <View style={styles.creatorNameCol}>
            <View style={styles.creatorNameRow}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {post.creator.displayName || post.creator.username || 'Creator'}
              </Text>
              {(post.creator as any).kycStatus === 'VERIFIED' && (
                <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
              )}
            </View>
            {post.creator.tokenSymbol && (
              <Text style={styles.creatorToken}>{post.creator.tokenSymbol}</Text>
            )}
          </View>
        </Pressable>

        <View style={styles.creatorBarRight}>
          <Pressable
            onPress={() => followMutation.mutate()}
            style={[styles.creatorActionBtn, isFollowing && styles.creatorActionBtnOutline]}
          >
            <Text style={[styles.creatorActionText, isFollowing && styles.creatorActionTextOutline]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setShowBuyModal(true)} style={styles.creatorBuyBtn}>
            <Text style={styles.creatorBuyText}>Buy</Text>
          </Pressable>
        </View>
      </View>

      <ComingSoonModal
        visible={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
      />
    </View>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  // Dynamic tab bar height: 64 base + bottom safe area (mirrors _layout.tsx line 77)
  const tabBarHeight = 64 + Math.max(insets.bottom, 12);
  const [feedSort, setFeedSort] = useState<FeedSortMode>('smart');
  const [showAlgoModal, setShowAlgoModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const feedQuery = useFeed({ sort: feedSort }, currentIndex);
  const leaderboard = useCreatorLeaderboard();
  const flashListRef = useRef<FlashList<PostWithCreator>>(null);

  // Derive ticker banner items from real creator data
  const trendingItems = useMemo(() => {
    if (!leaderboard.data?.trending) return [];
    return leaderboard.data.trending.map((c) => ({
      symbol: c.tokenSymbol || `$${c.username}`,
      change: c.topPostLikeCount,
    }));
  }, [leaderboard.data?.trending]);

  const creatorsItems = useMemo(() => {
    if (!leaderboard.data?.mostActive) return [];
    return leaderboard.data.mostActive.map((c) => ({
      symbol: c.tokenSymbol || `$${c.username}`,
      change: c.postCount,
    }));
  }, [leaderboard.data?.mostActive]);

  // Dynamic ticker height: only count space if tickers actually render
  const hasTickers = trendingItems.length > 0 || creatorsItems.length > 0;
  const tickerHeight = hasTickers ? TICKER_HEIGHT : 0;
  // Accurate page height: screen - safeAreaTop - header - tickers - tabBar
  const PAGE_HEIGHT = SCREEN_HEIGHT - insets.top - HEADER_HEIGHT - tickerHeight - tabBarHeight;

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

  const handleSortChange = useCallback((sort: FeedSortMode) => {
    setFeedSort(sort);
    // Scroll back to start when sort changes
    flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    setCurrentIndex(0);
  }, []);

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
    ({ item, index }: { item: PostWithCreator; index: number }) => (
      <FeedPage post={item} screenWidth={SCREEN_WIDTH} pageHeight={PAGE_HEIGHT} isVisible={index === currentIndex} />
    ),
    [SCREEN_WIDTH, PAGE_HEIGHT, currentIndex]
  );

  const extraData = currentIndex;

  const keyExtractor = useCallback(
    (item: PostWithCreator) => item.id,
    []
  );

  if (feedQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <MomentoLogo size={28} />
        </View>
        <FeedSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.surfaceElevated}
          />
        }
      >
      {/* Compact header */}
      <View style={styles.header}>
        {/* Algorithm button — left side */}
        <Pressable
          onPress={() => setShowAlgoModal(true)}
          style={styles.algoButton}
          hitSlop={8}
        >
          <Ionicons
            name={SORT_ICONS[feedSort]}
            size={18}
            color={COLORS.primary}
          />
        </Pressable>

        <MomentoLogo size={28} />

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={styles.bellButton}
            hitSlop={8}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={COLORS.textSecondary}
            />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleRefresh} hitSlop={8}>
            {feedQuery.isRefetching ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={COLORS.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Ticker Banners */}
      <View style={styles.tickerSection}>
        {trendingItems.length > 0 && (
          <TickerBanner
            title="TRENDING"
            items={trendingItems}
            valueSuffix=" likes"
            onPress={handleTickerPress}
          />
        )}
        {creatorsItems.length > 0 && (
          <TickerBanner
            title="MOST ACTIVE"
            items={creatorsItems}
            valueSuffix=" posts"
            onPress={handleTickerPress}
          />
        )}
      </View>

      {posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No posts yet</Text>
          <Text style={styles.emptySubtext}>
            Follow creators to see their posts here
          </Text>
          <Pressable style={styles.fundButton} onPress={() => setShowFundModal(true)}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.background} />
            <Text style={styles.fundButtonText}>Fund Your Wallet</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlashList
            ref={flashListRef}
            data={posts}
            extraData={extraData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            estimatedItemSize={SCREEN_WIDTH}
            drawDistance={SCREEN_WIDTH}
          />

          {/* Page indicator */}
          <View style={styles.pageIndicator}>
            <Text style={styles.pageText}>
              {currentIndex + 1} / {posts.length}
            </Text>
          </View>
        </>
      )}

      {/* Feed Algorithm Modal */}
      <FeedAlgorithmModal
        visible={showAlgoModal}
        onClose={() => setShowAlgoModal(false)}
        currentSort={feedSort}
        onSortChange={handleSortChange}
      />
      </ScrollView>

      {/* Swipe indicator — shows once on first visit */}
      {posts.length > 1 && <SwipeIndicator />}

      {/* Wallet funding nudge — shows if user skipped funding screen */}
      <CoachMark
        hintId="wallet_fund"
        text="Fund your account to start trading creator tokens"
        position="bottom"
        onDismiss={() => router.push('/wallet')}
      >
        <View />
      </CoachMark>

      <FundWalletModal visible={showFundModal} onClose={() => setShowFundModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  algoButton: {
    position: 'absolute',
    left: SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    position: 'absolute',
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  bellButton: {
    position: 'relative',
    padding: SPACING.xs,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Ticker banners
  tickerSection: {
    paddingBottom: SPACING.xs,
  },

  // Feed page — NO flex:1 here! The explicit inline { height: pageHeight } defines the size.
  // flex:1 would override height and let FlashList's container stretch the page.
  page: {
    backgroundColor: COLORS.background,
  },
  mediaSection: {
    flex: 1,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
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

  // Action bar — sits BELOW media, no z-ordering conflicts with native views
  actionBar: {
    height: ACTION_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.backgroundTertiary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  actionBarLeft: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  actionBarCaption: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  actionBarDistance: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },
  actionBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  actionBarIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionBarCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },

  // Creator info section — fixed at bottom, NOT overlaid on media
  creatorSection: {
    height: CREATOR_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  creatorBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    marginRight: SPACING.sm,
  },
  creatorNameCol: {
    flexShrink: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
  },
  creatorToken: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  creatorBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  creatorActionBtn: {
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md + 2,
    borderRadius: RADII.full,
  },
  creatorActionBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
  },
  creatorActionText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 13,
  },
  creatorActionTextOutline: {
    color: COLORS.textPrimary,
  },
  creatorBuyBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md + 2,
    borderRadius: RADII.full,
  },
  creatorBuyText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 13,
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
  fundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    marginTop: SPACING.lg,
  },
  fundButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
  },
});
