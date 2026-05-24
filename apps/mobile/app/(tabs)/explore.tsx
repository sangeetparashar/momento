import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  useWindowDimensions,
  Animated,
  TextInput,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, CoachMark, MediaImage } from '@/components/primitives';
import { useCoachMark } from '@/hooks/useCoachMark';
import { ExploreSkeleton, FundWalletModal } from '@/components/features';
import { useFeed, useNearbyCreators, useSearch } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatDistance, formatNumber } from '@/utils/formatters';
import { PostType } from '@momento/shared';
import type { PostWithCreator, PublicCreator } from '@momento/shared';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

type ExploreTab = 'CREATORS' | 'POSTS';

const COLUMN_GAP = 2;

interface GridItem {
  id: string;
  type: 'post' | 'creator';
  imageUri?: string;
  label?: string;
  sublabel?: string;
  /** Full text content for text-only posts */
  textContent?: string;
  distanceText?: string;
  heightMultiplier: number;
  postId?: string;
  creatorId?: string;
  followerCount?: number;
  postCount?: number;
  isVideo?: boolean;
}

// Staggered animated card
function AnimatedCard({
  item,
  index,
  itemWidth,
  onPress,
}: {
  item: GridItem;
  index: number;
  itemWidth: number;
  onPress: () => void;
}) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: 1,
      delay: index * 80,
      damping: 14,
      stiffness: 120,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, []);

  const height = itemWidth * item.heightMultiplier;
  const isCreator = item.type === 'creator';

  return (
    <Animated.View
      style={{
        opacity: animValue,
        transform: [
          {
            translateY: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            }),
          },
          {
            scale: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: [0.95, 1],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        style={[styles.gridItem, { height }]}
      >
        {item.imageUri ? (
          <>
            <MediaImage
              uri={item.imageUri}
              style={styles.gridImage}
              placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
            />
            {item.isVideo && (
              <View style={styles.videoPlayIcon}>
                <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.85)" />
              </View>
            )}
          </>
        ) : item.textContent ? (
          <View style={[styles.gridImage, styles.textPostCard]}>
            <View style={styles.textPostQuoteMark}>
              <Text style={styles.textPostQuoteIcon}>"</Text>
            </View>
            <Text style={styles.textPostPreview} numberOfLines={6}>
              {item.textContent}
            </Text>
            {item.label && (
              <Text style={styles.textPostAuthor} numberOfLines={1}>
                — {item.label}
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Text style={styles.placeholderText}>
              {(item.label || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* No overlay — pure image grid per Figma */}
      </Pressable>
    </Animated.View>
  );
}

// Search result card for creators — matches landing page "Discover Nearby" design
function CreatorSearchRow({
  creator,
  onPress,
}: {
  creator: PublicCreator;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.creatorCard}>
      <View style={styles.creatorCardHeader}>
        <Avatar
          uri={creator.avatarUrl}
          name={creator.displayName || creator.username}
          size="md"
        />
        <View style={styles.creatorCardInfo}>
          <Text style={styles.creatorCardName} numberOfLines={1}>
            {creator.displayName || creator.username}
          </Text>
          <Text style={styles.creatorCardHandle} numberOfLines={1}>
            @{creator.username || 'creator'}
          </Text>
        </View>
        {creator.tokenSymbol && (
          <View style={styles.creatorCardPriceBadge}>
            <Text style={styles.creatorCardPrice}>${creator.tokenSymbol}</Text>
          </View>
        )}
      </View>
      {/* Preview area — avatar banner or placeholder */}
      <View style={styles.creatorCardPreview}>
        {creator.bannerUrl ? (
          <MediaImage
            uri={creator.bannerUrl}
            style={styles.creatorCardBanner}
          />
        ) : (
          <View style={styles.creatorCardBannerPlaceholder} />
        )}
      </View>
      <View style={styles.creatorCardFooter}>
        <View style={styles.creatorCardStat}>
          <Text style={styles.creatorCardStatValue}>{formatNumber(creator.followerCount)}</Text>
          <Text style={styles.creatorCardStatLabel}>followers</Text>
        </View>
        <View style={styles.creatorCardStat}>
          <Text style={styles.creatorCardStatValue}>{formatNumber(creator.postCount)}</Text>
          <Text style={styles.creatorCardStatLabel}>posts</Text>
        </View>
        {creator.distanceMeters != null && (
          <View style={styles.creatorCardStat}>
            <Ionicons name="location-outline" size={11} color={COLORS.primary} />
            <Text style={styles.creatorCardStatLabel}>{formatDistance(creator.distanceMeters)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Search result row for posts
function PostSearchRow({
  post,
  onPress,
}: {
  post: PostWithCreator;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.searchRow}>
      {post.mediaUrl ? (
        <MediaImage
          uri={post.mediaUrl}
          style={styles.searchThumb}
        />
      ) : (
        <View style={[styles.searchThumb, styles.searchThumbText]}>
          <Text style={styles.searchThumbQuote}>"</Text>
          <Text style={styles.searchThumbSnippet} numberOfLines={2}>
            {post.content || post.caption || ''}
          </Text>
        </View>
      )}
      <View style={styles.searchRowInfo}>
        <Text style={styles.searchRowName} numberOfLines={1}>
          {post.creator?.displayName || post.creator?.username || 'Creator'}
        </Text>
        <Text style={styles.searchRowCaption} numberOfLines={2}>
          {post.caption || post.content || 'No caption'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ITEM_WIDTH = useMemo(() => (SCREEN_WIDTH - COLUMN_GAP) / 2, [SCREEN_WIDTH]);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExploreTab>('POSTS');
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const feedQuery = useFeed();
  const creatorsQuery = useNearbyCreators();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const { visible: showSwipeHint, dismiss: dismissSwipeHint } = useCoachMark('explore_swipe_tabs');

  // Sub-tab swipe between CREATORS ↔ POSTS using PanResponder
  // PanResponder captures horizontal swipes even over FlatList
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const panResponder = useMemo(() => PanResponder.create({
    // Only claim the gesture when it's clearly horizontal (not vertical scroll)
    onMoveShouldSetPanResponder: (_evt, gestureState) => {
      const { dx, dy } = gestureState;
      // Must move at least 10px and be more horizontal than vertical
      return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
    },
    onMoveShouldSetPanResponderCapture: () => false, // don't steal from children initially
    onPanResponderRelease: (_evt, gestureState) => {
      const { dx, dy, vx } = gestureState;
      // Require: >60px horizontal, more horizontal than vertical, and decent velocity
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0 && activeTabRef.current === 'CREATORS') {
        setActiveTab('POSTS');
        if (showSwipeHint) dismissSwipeHint();
      } else if (dx > 0 && activeTabRef.current === 'POSTS') {
        setActiveTab('CREATORS');
        if (showSwipeHint) dismissSwipeHint();
      }
    },
  }), [showSwipeHint, dismissSwipeHint]);

  const searchType = activeTab === 'CREATORS' ? 'creators' : 'posts';
  const { results, isSearching, isActive: isSearchActive } = useSearch(searchText, searchText.length >= 2 ? searchType : 'all');

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'CREATORS') {
        await creatorsQuery.refetch();
      } else {
        await feedQuery.refreshFeed();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, creatorsQuery, feedQuery]);

  const posts = useMemo(() => {
    if (!feedQuery.data?.pages) return [];
    const all = feedQuery.data.pages.flatMap((page) => page.posts);
    // Deduplicate by post ID (can appear across pages)
    const seen = new Set<string>();
    return all.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [feedQuery.data]);

  // Create varied height patterns for visual interest
  const heightPattern = [1.0, 1.35, 1.15, 1.0, 1.4, 1.0, 1.2, 1.0, 1.3, 1.1];

  const gridItems = useMemo((): GridItem[] => {
    if (activeTab === 'POSTS') {
      return posts.map((post: PostWithCreator, index: number) => {
        const isVideo = post.postType === PostType.VIDEO ||
          (post.mediaUrl ? VIDEO_EXTENSIONS.some((ext) => post.mediaUrl!.toLowerCase().endsWith(ext)) : false);
        return {
          id: post.id,
          type: 'post' as const,
          imageUri: post.mediaUrl,
          label: post.creator.displayName || post.creator.username,
          sublabel: post.caption,
          textContent: !post.mediaUrl ? (post.content || post.caption) : undefined,
          distanceText: post.distanceMeters ? formatDistance(post.distanceMeters) : undefined,
          heightMultiplier: heightPattern[index % heightPattern.length],
          postId: post.id,
          isVideo,
        };
      });
    }

    // Deduplicate creators (can appear across pages)
    const seenCreators = new Set<string>();
    const uniqueCreators = creatorsQuery.creators.filter((c: PublicCreator) => {
      if (seenCreators.has(c.id)) return false;
      seenCreators.add(c.id);
      return true;
    });
    return uniqueCreators.map(
      (creator: PublicCreator, index: number) => ({
        id: creator.id,
        type: 'creator' as const,
        imageUri: creator.avatarUrl || creator.bannerUrl,
        label: creator.displayName || creator.username,
        sublabel: creator.tokenSymbol
          ? `$${creator.tokenSymbol}`
          : undefined,
        distanceText: creator.distanceMeters ? formatDistance(creator.distanceMeters) : undefined,
        heightMultiplier: heightPattern[(index + 3) % heightPattern.length],
        creatorId: creator.id,
        followerCount: creator.followerCount,
        postCount: creator.postCount,
      })
    );
  }, [activeTab, posts, creatorsQuery.creators]);

  // Split items into two columns for masonry effect
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: GridItem[] = [];
    const right: GridItem[] = [];
    let leftHeight = 0;
    let rightHeight = 0;
    gridItems.forEach((item) => {
      if (leftHeight <= rightHeight) {
        left.push(item);
        leftHeight += item.heightMultiplier;
      } else {
        right.push(item);
        rightHeight += item.heightMultiplier;
      }
    });
    return { leftColumn: left, rightColumn: right };
  }, [gridItems]);

  const handleItemPress = useCallback(
    (item: GridItem) => {
      if (item.type === 'post' && item.postId) {
        router.push(`/post/${item.postId}`);
      } else if (item.type === 'creator' && item.creatorId) {
        router.push(`/creator/${item.creatorId}`);
      }
    },
    [router]
  );

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    inputRef.current?.blur();
  }, []);

  const handleEndReached = useCallback(() => {
    if (activeTab === 'POSTS') {
      if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
        feedQuery.fetchNextPage();
      }
    } else {
      if (creatorsQuery.hasNextPage && !creatorsQuery.isFetchingNextPage) {
        creatorsQuery.fetchNextPage();
      }
    }
  }, [activeTab, feedQuery, creatorsQuery]);

  const isFetchingMore =
    activeTab === 'POSTS' ? feedQuery.isFetchingNextPage : creatorsQuery.isFetchingNextPage;

  const showSearchResults = isSearchActive && searchText.length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar — always visible. Cancel button appears when focused so
          users have an escape hatch from the keyboard (iOS HIG pattern). */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputRow}>
          <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
            <Ionicons name="search" size={18} color={searchFocused ? COLORS.primary : COLORS.textTertiary} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search creators..."
              placeholderTextColor={COLORS.textTertiary}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable onPress={handleClearSearch} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
              </Pressable>
            )}
            {isSearching && (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
          {searchFocused && (
            <Pressable onPress={handleClearSearch} hitSlop={8} style={styles.searchCancelBtn}>
              <Text style={styles.searchCancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Content area — swipeable between CREATORS/POSTS */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {showSearchResults ? (
        <FlatList
          data={
            activeTab === 'CREATORS'
              ? results.creators.map((c) => ({ ...c, _type: 'creator' as const }))
              : results.posts.map((p) => ({ ...p, _type: 'post' as const }))
          }
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item._type === 'creator' ? (
              <CreatorSearchRow
                creator={item as any}
                onPress={() => router.push(`/creator/${item.id}`)}
              />
            ) : (
              <PostSearchRow
                post={item as any}
                onPress={() => router.push(`/post/${item.id}`)}
              />
            )
          }
          contentContainerStyle={styles.searchListContent}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !isSearching ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={40} color={COLORS.textTertiary} />
                <Text style={styles.emptyText}>
                  No {activeTab === 'CREATORS' ? 'creators' : 'posts'} found for "{searchText}"
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        /* Masonry Grid (default browse mode) */
        ((activeTab === 'CREATORS' && creatorsQuery.isLoading) || (activeTab === 'POSTS' && feedQuery.isLoading)) ? (
          <ExploreSkeleton />
        ) : (
          <FlatList
            data={gridItems.length > 0 ? [{ key: 'masonry' }] : []}
            removeClippedSubviews={true}
            maxToRenderPerBatch={4}
            windowSize={7}
            initialNumToRender={3}
            renderItem={() => (
              <View style={styles.masonryContainer}>
                <View style={styles.column}>
                  {leftColumn.map((item, index) => (
                    <AnimatedCard
                      key={`L-${item.id}-${index}`}
                      item={item}
                      index={index * 2}
                      itemWidth={ITEM_WIDTH}
                      onPress={() => handleItemPress(item)}
                    />
                  ))}
                </View>
                <View style={styles.column}>
                  {rightColumn.map((item, index) => (
                    <AnimatedCard
                      key={`R-${item.id}-${index}`}
                      item={item}
                      index={index * 2 + 1}
                      itemWidth={ITEM_WIDTH}
                      onPress={() => handleItemPress(item)}
                    />
                  ))}
                </View>
              </View>
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.textTertiary}
              />
            }
            ListFooterComponent={
              isFetchingMore ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingMoreText}>Loading more...</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {activeTab === 'CREATORS'
                    ? 'No creators nearby'
                    : 'Nothing to explore yet'}
                </Text>
                <Pressable style={styles.fundButton} onPress={() => setShowFundModal(true)}>
                  <Ionicons name="wallet-outline" size={18} color={COLORS.background} />
                  <Text style={styles.fundButtonText}>Fund Your Wallet</Text>
                </Pressable>
              </View>
            }
          />
        )
      )}
      </View>

      <FundWalletModal visible={showFundModal} onClose={() => setShowFundModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchTrigger: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Search
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchCancelBtn: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  searchCancelText: {
    ...TYPOGRAPHY.label,
    color: COLORS.primary,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  searchBarFocused: {
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.background,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    padding: 0,
    fontSize: 15,
  },
  // Creator card — matches landing page "Discover Nearby Creators" design
  creatorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  creatorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  creatorCardInfo: {
    flex: 1,
  },
  creatorCardName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  creatorCardHandle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 1,
  },
  creatorCardPriceBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  creatorCardPrice: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  creatorCardPreview: {
    height: 80,
    backgroundColor: COLORS.backgroundTertiary,
  },
  creatorCardBanner: {
    width: '100%',
    height: '100%',
  },
  creatorCardBannerPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.backgroundTertiary,
  },
  creatorCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  creatorCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorCardStatValue: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  creatorCardStatLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 11,
  },
  // Search results
  searchListContent: {
    paddingHorizontal: SPACING.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchThumb: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
  },
  searchThumbPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundTertiary,
  },
  searchThumbText: {
    backgroundColor: COLORS.primaryMuted,
    padding: 4,
    overflow: 'hidden',
  },
  searchThumbQuote: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '900',
    lineHeight: 14,
    opacity: 0.5,
  },
  searchThumbSnippet: {
    fontSize: 8,
    color: COLORS.textPrimary,
    lineHeight: 10,
  },
  searchRowInfo: {
    flex: 1,
  },
  searchRowName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  searchRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  searchRowToken: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  searchRowStat: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  searchRowCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Tabs
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 3,
    marginBottom: SPACING.md,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.lg - 3,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  toggleText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleTextActive: {
    color: COLORS.textPrimary,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADII.full,
  },
  swipeHintText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  // Grid
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: SPACING.xl,
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
  },
  column: {
    flex: 1,
    gap: COLUMN_GAP,
  },
  gridItem: {
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayIcon: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    zIndex: 2,
  },
  placeholderText: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textTertiary,
    fontSize: 40,
  },
  textPostCard: {
    backgroundColor: COLORS.primaryMuted,
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  textPostQuoteMark: {
    position: 'absolute',
    top: 4,
    left: SPACING.sm,
    opacity: 0.3,
  },
  textPostQuoteIcon: {
    fontSize: 32,
    color: COLORS.primary,
    fontWeight: '900',
    lineHeight: 32,
  },
  textPostPreview: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    lineHeight: 20,
    fontSize: 13,
    fontWeight: '500',
  },
  textPostAuthor: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.sm,
    paddingTop: SPACING.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  creatorOverlay: {
    paddingTop: SPACING.xl,
  },
  gridLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  gridSublabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  creatorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  tokenBadge: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  distanceText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  // Loading more
  loadingMore: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  loadingMoreText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  emptyState: {
    paddingVertical: SPACING.xl * 3,
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
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
