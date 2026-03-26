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
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, CoachMark } from '@/components/primitives';
import { ExploreSkeleton, FundWalletModal } from '@/components/features';
import { useFeed, useNearbyCreators, useSearch, useSwipeNavigation } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatDistance, formatNumber } from '@/utils/formatters';
import { PostType } from '@momento/shared';
import type { PostWithCreator, PublicCreator } from '@momento/shared';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

type ExploreTab = 'CREATORS' | 'POSTS';

const COLUMN_GAP = SPACING.sm;

interface GridItem {
  id: string;
  type: 'post' | 'creator';
  imageUri?: string;
  label?: string;
  sublabel?: string;
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
            <Image
              source={{ uri: item.imageUri }}
              style={styles.gridImage}
              contentFit="cover"
              transition={200}
              cachePolicy="disk"
              recyclingKey={item.imageUri}
              placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
            />
            {item.isVideo && (
              <View style={styles.videoPlayIcon}>
                <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.85)" />
              </View>
            )}
          </>
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Text style={styles.placeholderText}>
              {(item.label || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Bottom overlay with info */}
        <View style={[
          styles.gridOverlay,
          isCreator && styles.creatorOverlay,
        ]}>
          <Text style={styles.gridLabel} numberOfLines={1}>
            {item.label}
          </Text>
          {isCreator && (
            <View style={styles.creatorMeta}>
              {item.sublabel && (
                <Text style={styles.tokenBadge}>{item.sublabel}</Text>
              )}
              {item.distanceText && (
                <View style={styles.distanceRow}>
                  <Ionicons name="location-outline" size={10} color={COLORS.primary} />
                  <Text style={styles.distanceText}>{item.distanceText}</Text>
                </View>
              )}
            </View>
          )}
          {!isCreator && item.sublabel && (
            <Text style={styles.gridSublabel} numberOfLines={2}>
              {item.sublabel}
            </Text>
          )}
          {!isCreator && item.distanceText && (
            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={10} color={COLORS.primary} />
              <Text style={styles.distanceText}>{item.distanceText}</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Search result row for creators
function CreatorSearchRow({
  creator,
  onPress,
}: {
  creator: PublicCreator;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.searchRow}>
      <Avatar
        uri={creator.avatarUrl}
        name={creator.displayName || creator.username}
        size="md"
      />
      <View style={styles.searchRowInfo}>
        <Text style={styles.searchRowName} numberOfLines={1}>
          {creator.displayName || creator.username}
        </Text>
        <View style={styles.searchRowMeta}>
          {creator.tokenSymbol && (
            <Text style={styles.searchRowToken}>${creator.tokenSymbol}</Text>
          )}
          <Text style={styles.searchRowStat}>
            {formatNumber(creator.followerCount)} followers
          </Text>
          {creator.distanceMeters != null && (
            <Text style={styles.searchRowStat}>
              {formatDistance(creator.distanceMeters)}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
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
        <Image
          source={{ uri: post.mediaUrl }}
          style={styles.searchThumb}
          contentFit="cover"
          transition={200}
          cachePolicy="disk"
          recyclingKey={post.mediaUrl}
        />
      ) : (
        <View style={[styles.searchThumb, styles.searchThumbPlaceholder]}>
          <Ionicons name="document-text-outline" size={18} color={COLORS.textTertiary} />
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
  const { translateX, onTouchStart, onTouchEnd } = useSwipeNavigation({ currentScreen: '/(tabs)/explore' });
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ITEM_WIDTH = useMemo(() => (SCREEN_WIDTH - SPACING.md * 2 - COLUMN_GAP) / 2, [SCREEN_WIDTH]);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExploreTab>('CREATORS');
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const feedQuery = useFeed();
  const creatorsQuery = useNearbyCreators();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);

  // Sub-tab swipe between CREATORS ↔ POSTS
  const subTabTouch = useRef<{ x: number; y: number; time: number } | null>(null);
  const handleContentTouchStart = useCallback((e: any) => {
    subTabTouch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, time: Date.now() };
  }, []);
  const handleContentTouchEnd = useCallback((e: any) => {
    if (!subTabTouch.current) return;
    const dx = e.nativeEvent.pageX - subTabTouch.current.x;
    const dy = e.nativeEvent.pageY - subTabTouch.current.y;
    const dt = Date.now() - subTabTouch.current.time;
    subTabTouch.current = null;
    if (dt > 350 || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (dx < 0 && activeTab === 'CREATORS') setActiveTab('POSTS');
    else if (dx > 0 && activeTab === 'POSTS') setActiveTab('CREATORS');
  }, [activeTab]);

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
    return feedQuery.data.pages.flatMap((page) => page.posts);
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
          distanceText: post.distanceMeters ? formatDistance(post.distanceMeters) : undefined,
          heightMultiplier: heightPattern[index % heightPattern.length],
          postId: post.id,
          isVideo,
        };
      });
    }

    return creatorsQuery.creators.map(
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
    <SafeAreaView style={styles.container} edges={['top']} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Animated.View style={[{ flex: 1 }, { transform: [{ translateX }] }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
      </View>

      {/* Search Bar */}
      <CoachMark
        hintId="explore_search"
        text="Search for creators, tokens, or posts"
        position="bottom"
      >
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textTertiary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search creators, posts..."
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
      </View>
      </CoachMark>

      {/* Segmented Toggle */}
      <View style={styles.toggleContainer}>
        <Pressable
          onPress={() => setActiveTab('CREATORS')}
          style={[
            styles.toggleButton,
            activeTab === 'CREATORS' && styles.toggleButtonActive,
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              activeTab === 'CREATORS' && styles.toggleTextActive,
            ]}
          >
            CREATORS
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('POSTS')}
          style={[
            styles.toggleButton,
            activeTab === 'POSTS' && styles.toggleButtonActive,
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              activeTab === 'POSTS' && styles.toggleTextActive,
            ]}
          >
            POSTS
          </Text>
        </Pressable>
      </View>

      {/* Content area — swipeable between CREATORS/POSTS */}
      <View style={{ flex: 1 }} onTouchStart={handleContentTouchStart} onTouchEnd={handleContentTouchEnd}>
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
                      key={item.id}
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
                      key={item.id}
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
      </Animated.View>

      <FundWalletModal visible={showFundModal} onClose={() => setShowFundModal(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  // Search
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    padding: 0,
    fontSize: 15,
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
  // Grid
  listContent: {
    paddingHorizontal: SPACING.md,
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
    borderRadius: RADII.lg,
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
