import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Share,
  ActivityIndicator,
  LayoutChangeEvent,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { PillTabs } from '@/components/composites';
import { LikeButton, FeedSkeleton, FeedAlgorithmModal, FundWalletModal, ComingSoonModal } from '@/components/features';
import { useNotifications } from '@/providers/NotificationProvider';
import { useFeed } from '@/hooks';
import { useMutation } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { FeedSortMode } from '@/hooks/useFeed';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
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

const HEADER_HEIGHT = 44;
const PEEK_HEIGHT = 70;

type FeedTab = 'FOR_YOU' | 'CREATORS_TO_WATCH';

// ─── Feed Card ───
const FeedPage = React.memo(function FeedPage({
  post,
  cardHeight,
  isVisible,
}: {
  post: PostWithCreator;
  cardHeight: number;
  isVisible: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<Video>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const isVideo = isVideoPost(post);

  const followMutation = useMutation({
    mutationFn: () => apiService.post(`/creators/${post.creatorId}/follow`),
  });

  // Video lifecycle
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (!isVisible) {
      videoRef.current.stopAsync().catch(() => {});
      videoRef.current.unloadAsync().catch(() => {});
    } else {
      videoRef.current.loadAsync(
        { uri: post.mediaUrl! },
        { shouldPlay: true, isMuted, isLooping: true }
      ).catch(() => {});
    }
  }, [isVisible, isVideo, post.mediaUrl, isMuted]);

  const handleCreatorPress = useCallback(() => {
    router.push(`/creator/${post.creatorId}`);
  }, [post.creatorId, router]);

  const handlePostPress = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [post.id, router]);

  const handleVideoTap = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  return (
    <Pressable
      onPress={isVideo ? handleVideoTap : handlePostPress}
      style={[styles.card, { height: cardHeight }]}
    >
      {/* Full-bleed media */}
      {post.mediaUrl && isVideo ? (
        <Video
          ref={videoRef}
          source={{ uri: post.mediaUrl }}
          style={StyleSheet.absoluteFill}
          shouldPlay={isVisible && isPlaying}
          isMuted={isMuted}
          isLooping
          resizeMode={ResizeMode.COVER}
        />
      ) : post.mediaUrl ? (
        <Image
          source={{ uri: post.mediaUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
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

      {/* Bottom gradient overlay */}
      <View style={styles.cardGradient} />

      {/* Creator info + caption + like — overlaid at bottom */}
      <View style={styles.cardOverlay}>
        {/* Creator name + verified */}
        <Pressable onPress={handleCreatorPress} style={styles.creatorRow}>
          <Text style={styles.creatorName} numberOfLines={1}>
            {post.creator.displayName || post.creator.username || 'Creator'}
          </Text>
          {(post.creator as any).kycStatus === 'VERIFIED' && (
            <View style={styles.verifiedDot} />
          )}
        </Pressable>

        {/* Caption */}
        {post.caption ? (
          <Text style={styles.captionText} numberOfLines={2}>
            {post.caption}
          </Text>
        ) : null}

        {/* Like button */}
        <View style={styles.likeRow}>
          <LikeButton
            postId={post.id}
            initialLiked={post.isLiked}
            initialCount={post.likeCount}
            size={20}
          />
        </View>
      </View>

      {/* Mute toggle for video */}
      {isVideo && post.mediaUrl && (
        <Pressable
          onPress={() => setIsMuted((prev) => !prev)}
          style={styles.muteButton}
          hitSlop={8}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={18}
            color={COLORS.textPrimary}
          />
        </Pressable>
      )}
    </Pressable>
  );
});

// ─── Main Screen ───
export default function HomeScreen() {
  const router = useRouter();
  const [feedTab, setFeedTab] = useState<FeedTab>('FOR_YOU');
  const [feedSort, setFeedSort] = useState<FeedSortMode>('smart');
  const [sortLoaded, setSortLoaded] = useState(false);
  const [showAlgoModal, setShowAlgoModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [listHeight, setListHeight] = useState(0);

  const cardHeight = listHeight > 0 ? listHeight - PEEK_HEIGHT : 0;

  const handleListContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setListHeight(e.nativeEvent.layout.height);
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

  // Map tab → sort mode: "Trending" tab uses popular (most liked), "For You" uses user's algo preference
  const effectiveSort = feedTab === 'CREATORS_TO_WATCH' ? 'popular' : feedSort;
  const feedQuery = useFeed({ sort: effectiveSort, enabled: sortLoaded }, currentIndex);
  const flatListRef = useRef<FlatList<PostWithCreator>>(null);

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

  const handleSortChange = useCallback((sort: FeedSortMode) => {
    setFeedSort(sort);
    AsyncStorage.setItem('momento_feed_sort', sort).catch(() => {});
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    setCurrentIndex(0);
  }, []);

  const handleTabPress = useCallback((tab: FeedTab) => {
    setFeedTab(tab);
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
      <FeedPage
        post={item}
        cardHeight={cardHeight}
        isVisible={index === currentIndex}
      />
    ),
    [cardHeight, currentIndex]
  );

  const keyExtractor = useCallback(
    (item: PostWithCreator) => item.id,
    []
  );

  if (feedQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerIcon} />
          <PillTabs
            tabs={[
              { key: 'FOR_YOU', label: 'For You' },
              { key: 'CREATORS_TO_WATCH', label: 'Trending' },
            ]}
            activeTab="FOR_YOU"
            onTabChange={() => {}}
            style={{ flex: 1, marginHorizontal: SPACING.xs }}
          />
          <View style={styles.headerIcon} />
        </View>
        <FeedSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header — algo button, feed tabs, market link */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setShowAlgoModal(true)}
          style={styles.headerIcon}
          hitSlop={8}
        >
          <Ionicons name="options-outline" size={18} color={COLORS.textTertiary} />
        </Pressable>

        <PillTabs
          tabs={[
            { key: 'FOR_YOU', label: 'For You' },
            { key: 'CREATORS_TO_WATCH', label: 'Trending' },
          ]}
          activeTab={feedTab}
          onTabChange={(key) => handleTabPress(key as FeedTab)}
          style={{ flex: 1, marginHorizontal: SPACING.xs }}
        />

        <Pressable
          onPress={() => router.push('/market')}
          style={styles.headerIcon}
          hitSlop={8}
        >
          <Ionicons name="trending-up" size={18} color={COLORS.textTertiary} />
        </Pressable>
      </View>

      {/* Feed */}
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
        ) : cardHeight > 0 ? (
          <FlatList
            ref={flatListRef}
            data={posts}
            extraData={currentIndex}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            snapToInterval={cardHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshControl={
              <RefreshControl
                refreshing={feedQuery.isRefetching}
                onRefresh={handleRefresh}
                tintColor={COLORS.textTertiary}
              />
            }
            getItemLayout={(_, index) => ({
              length: cardHeight,
              offset: cardHeight * index,
              index,
            })}
          />
        ) : null}
      </View>

      {/* Feed Algorithm Modal — triggered by long-press on "FOR YOU" */}
      <FeedAlgorithmModal
        visible={showAlgoModal}
        onClose={() => setShowAlgoModal(false)}
        currentSort={feedSort}
        onSortChange={handleSortChange}
      />

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

  // ─── Header ───
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  headerTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  headerTab: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  headerTabActive: {
    color: COLORS.textPrimary,
  },
  headerIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Feed Card ───
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  creatorName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    textTransform: 'none',
  },
  verifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  captionText: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: SPACING.xs,
    textTransform: 'none',
  },
  likeRow: {
    marginTop: SPACING.sm,
  },

  // ─── Mute button ───
  muteButton: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Text posts ───
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

  // ─── Empty state ───
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
    textTransform: 'none',
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
