import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Pressable,
  Share,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, MomentoLogo } from '@/components/primitives';
import { LikeButton, TickerBanner, BookmarkButton, FeedSkeleton, FeedAlgorithmModal } from '@/components/features';
import { useFeed } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { useNotifications } from '@/providers/NotificationProvider';
import type { FeedSortMode } from '@/hooks/useFeed';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatTimeAgo, formatNumber } from '@/utils/formatters';
import { DUMMY_TRENDING_TOKENS, DUMMY_CREATORS_TO_WATCH, PostType } from '@momento/shared';
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
  const isVideo = isVideoPost(post);

  const handleCreatorPress = useCallback(() => {
    router.push(`/creator/${post.creatorId}`);
  }, [post.creatorId, router]);

  const handlePostPress = useCallback(() => {
    if (isVideo) return; // Video area handles its own taps
    router.push(`/post/${post.id}`);
  }, [post.id, router, isVideo]);

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
      {/* Full-screen media — contain to show full image */}
      <Pressable onPress={handlePostPress} style={styles.mediaContainer}>
        {post.mediaUrl && isVideo ? (
          <Pressable onPress={handleVideoTap} style={styles.mediaContainer}>
            <Video
              ref={videoRef}
              source={{ uri: post.mediaUrl }}
              style={styles.fullImage}
              shouldPlay={isVisible && isPlaying}
              isMuted={isMuted}
              isLooping
              resizeMode={ResizeMode.CONTAIN}
            />
            {/* Play/Pause indicator */}
            {!isPlaying && (
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play" size={48} color="rgba(255,255,255,0.8)" />
              </View>
            )}
          </Pressable>
        ) : post.mediaUrl ? (
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.fullImage}
            contentFit="contain"
            transition={200}
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

      {/* Mute/Unmute toggle for video posts */}
      {isVideo && post.mediaUrl && (
        <Pressable onPress={handleMuteToggle} style={styles.muteButton} hitSlop={8}>
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={20}
            color={COLORS.textPrimary}
          />
        </Pressable>
      )}

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
});

/**
 * Auth gate overlay — shown on the home feed when the user is not signed in.
 * The feed is fully visible and scrollable behind this overlay to give users
 * a taste of the content before they commit to signing up.
 */
function AuthGateOverlay() {
  const auth = useAuth();
  const { isPrivyAvailable } = usePrivyGuard();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleSignIn = useCallback(async () => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      await auth.login();
      queryClient.invalidateQueries();
    } catch (error: any) {
      Alert.alert('Login Error', error?.message || String(error));
    }
  }, [auth, isPrivyAvailable, queryClient]);

  const handlePreview = useCallback(() => {
    // Dismiss handled by parent — this is a no-op for "continue browsing"
  }, []);

  return (
    <View style={authGateStyles.overlay}>
      <View style={authGateStyles.card}>
        <MomentoLogo size={40} showText />
        <Text style={authGateStyles.title}>Join Momento</Text>
        <Text style={authGateStyles.subtitle}>
          Sign in to like, comment, follow creators, and access your wallet.
        </Text>
        <TouchableOpacity onPress={handleSignIn} style={authGateStyles.signInButton} activeOpacity={0.7}>
          <Text style={authGateStyles.signInText}>SIGN IN</Text>
        </TouchableOpacity>
        {!isPrivyAvailable && (
          <TouchableOpacity onPress={handlePreview} style={authGateStyles.previewLink} activeOpacity={0.7}>
            <Text style={authGateStyles.previewText}>PREVIEW MODE (EXPO GO)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const { user: authUser } = useAuth();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const PAGE_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - TICKER_HEIGHT - TAB_BAR_HEIGHT;
  const [feedSort, setFeedSort] = useState<FeedSortMode>('smart');
  const [showAlgoModal, setShowAlgoModal] = useState(false);
  const feedQuery = useFeed({ sort: feedSort });
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

  const handleSortChange = useCallback((sort: FeedSortMode) => {
    setFeedSort(sort);
    // Scroll back to start when sort changes
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
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
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            removeClippedSubviews={true}
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

      {/* Feed Algorithm Modal */}
      <FeedAlgorithmModal
        visible={showAlgoModal}
        onClose={() => setShowAlgoModal(false)}
        currentSort={feedSort}
        onSortChange={handleSortChange}
      />
      </ScrollView>

      {/* Auth gate overlay — visible when user is not signed in */}
      {!authUser && <AuthGateOverlay />}
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

  // Feed page
  page: {
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

  // Video controls
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  muteButton: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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

const authGateStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    // Allow touches to pass through to feed above the card
    pointerEvents: 'box-none',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl + 20,
    alignItems: 'center',
    // Slight shadow to separate from feed
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
    pointerEvents: 'auto',
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
    marginTop: SPACING.md,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  signInButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full,
    width: '100%',
    alignItems: 'center',
  },
  signInText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 16,
  },
  previewLink: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADII.full,
  },
  previewText: {
    ...TYPOGRAPHY.label,
    color: COLORS.primary,
    letterSpacing: 1,
    fontWeight: '600',
  },
});
