import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Share,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
const CREATOR_HEADER_HEIGHT = 52; // creator avatar + name at TOP of post
const ACTION_BAR_HEIGHT = 96; // caption + action icons + buy button at bottom (generous to prevent clip)

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

  // Explicit pixel heights — no flex, no ambiguity, no native view overflow
  const mediaHeight = pageHeight - CREATOR_HEADER_HEIGHT - ACTION_BAR_HEIGHT;

  return (
    <View style={[styles.page, { width: screenWidth, height: pageHeight }]}>
      {/* ── Creator header — TOP of post, tappable to open profile ── */}
      <Pressable onPress={handleCreatorPress} style={styles.creatorHeader}>
        <Avatar
          uri={post.creator.avatarUrl}
          name={post.creator.displayName || post.creator.username || '?'}
          size="md"
        />
        <View style={styles.creatorHeaderInfo}>
          <View style={styles.creatorHeaderNameRow}>
            <Text style={styles.creatorHeaderName} numberOfLines={1}>
              {post.creator.displayName || post.creator.username || 'Creator'}
            </Text>
            {(post.creator as any).kycStatus === 'VERIFIED' && (
              <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
            )}
          </View>
          {post.creator.tokenSymbol && (
            <Text style={styles.creatorHeaderToken}>{post.creator.tokenSymbol}</Text>
          )}
        </View>
        <Pressable
          onPress={() => followMutation.mutate()}
          style={[styles.followBtn, isFollowing && styles.followBtnOutline]}
          hitSlop={6}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextOutline]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </Pressable>

      {/* ── Media area — explicit height, no flex ── */}
      <Pressable
        onPress={isVideo ? handleVideoTap : handlePostPress}
        style={[styles.mediaSection, { height: mediaHeight }]}
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

      {/* ── Action bar — caption, actions, buy button at BOTTOM ── */}
      <View style={styles.actionBar}>
        {/* Top row: caption + distance */}
        <View style={styles.actionBarTop}>
          {post.caption ? (
            <Text style={styles.actionBarCaption} numberOfLines={1}>{post.caption}</Text>
          ) : null}
          {post.distanceMeters != null && (
            <Text style={styles.actionBarDistance}>
              <Ionicons name="location-outline" size={11} color={COLORS.textTertiary} />
              {' '}
              {post.distanceMeters < 1000
                ? `${Math.round(post.distanceMeters)}m away`
                : `${(post.distanceMeters / 1000).toFixed(1)}km away`}
            </Text>
          )}
        </View>

        {/* Bottom row: action icons + buy */}
        <View style={styles.actionBarBottom}>
          <View style={styles.actionBarIcons}>
            {isVideo && post.mediaUrl && (
              <Pressable onPress={handleMuteToggle} style={styles.actionBarIcon} hitSlop={8}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            )}
            <View style={styles.actionBarIcon}>
              <LikeButton
                postId={post.id}
                initialLiked={post.isLiked}
                initialCount={post.likeCount}
                size={22}
              />
            </View>
            <Pressable onPress={handlePostPress} style={styles.actionBarIcon}>
              <Ionicons name="chatbubble-outline" size={22} color={COLORS.textSecondary} />
              {post.commentCount > 0 && (
                <Text style={styles.actionBarCount}>{formatNumber(post.commentCount)}</Text>
              )}
            </Pressable>
            <Pressable onPress={handleShare} style={styles.actionBarIcon}>
              <Ionicons name="paper-plane-outline" size={22} color={COLORS.textSecondary} />
            </Pressable>
            <View style={styles.actionBarIcon}>
              <BookmarkButton postId={post.id} initialSaved={post.isSaved} size={22} />
            </View>
          </View>
          <Pressable onPress={() => setShowBuyModal(true)} style={styles.buyBtn}>
            <Ionicons name="flash" size={14} color={COLORS.background} />
            <Text style={styles.buyBtnText}>Buy</Text>
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
  const [feedSort, setFeedSort] = useState<FeedSortMode>('smart');
  const [sortLoaded, setSortLoaded] = useState(false);
  const [showAlgoModal, setShowAlgoModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Measure the actual FlashList container height via onLayout — foolproof
  const [listHeight, setListHeight] = useState(0);
  const [listWidth, setListWidth] = useState(0);

  const handleListContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setListHeight(height);
    setListWidth(width);
  }, []);

  // Restore saved feed algorithm preference
  useEffect(() => {
    AsyncStorage.getItem('momento_feed_sort')
      .then((saved) => {
        if (saved && ['smart', 'recent', 'popular', 'nearby', 'following'].includes(saved)) {
          setFeedSort(saved as FeedSortMode);
        }
      })
      .catch(() => {})
      .finally(() => setSortLoaded(true));
  }, []);

  const feedQuery = useFeed({ sort: feedSort, enabled: sortLoaded }, currentIndex);
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
    // Persist preference so it's remembered across sessions
    AsyncStorage.setItem('momento_feed_sort', sort).catch(() => {});
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
      <FeedPage post={item} screenWidth={listWidth} pageHeight={listHeight} isVisible={index === currentIndex} />
    ),
    [listWidth, listHeight, currentIndex]
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

      {/* FlashList container — flex:1 fills remaining space, onLayout measures it */}
      <View style={styles.listContainer} onLayout={handleListContainerLayout}>
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
        ) : listHeight > 0 ? (
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
              estimatedItemSize={listWidth}
              drawDistance={listWidth}
            />

            {/* Page indicator */}
            <View style={styles.pageIndicator}>
              <Text style={styles.pageText}>
                {currentIndex + 1} / {posts.length}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Feed Algorithm Modal */}
      <FeedAlgorithmModal
        visible={showAlgoModal}
        onClose={() => setShowAlgoModal(false)}
        currentSort={feedSort}
        onSortChange={handleSortChange}
      />

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
  listContainer: {
    flex: 1,
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

  // ── Creator header — TOP of post ──
  creatorHeader: {
    height: CREATOR_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  creatorHeaderInfo: {
    flex: 1,
  },
  creatorHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorHeaderName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  creatorHeaderToken: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 6,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.full,
  },
  followBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
  },
  followBtnText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 13,
  },
  followBtnTextOutline: {
    color: COLORS.textPrimary,
  },

  // ── Action bar — BOTTOM of post ──
  actionBar: {
    height: ACTION_BAR_HEIGHT,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  actionBarTop: {
    marginBottom: SPACING.xs,
  },
  actionBarCaption: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionBarDistance: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  actionBarBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBarIcons: {
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
  buyBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: SPACING.lg + 6,
    borderRadius: RADII.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // 3D elevated look
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  buyBtnText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.background,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // Page indicator
  pageIndicator: {
    position: 'absolute',
    top: SPACING.sm,
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
