import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { ExploreSkeleton } from '@/components/features';
import { useFeed, useNearbyCreators } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatDistance } from '@/utils/formatters';
import type { PostWithCreator, PublicCreator } from '@momento/shared';

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
          <Image
            source={{ uri: item.imageUri }}
            style={styles.gridImage}
            contentFit="cover"
            transition={200}
          />
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

export default function ExploreScreen() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ITEM_WIDTH = useMemo(() => (SCREEN_WIDTH - SPACING.md * 2 - COLUMN_GAP) / 2, [SCREEN_WIDTH]);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExploreTab>('CREATORS');
  const feedQuery = useFeed();
  const { creators: nearbyCreators, isLoading: creatorsLoading, refetch: refetchCreators } = useNearbyCreators();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'CREATORS') {
        await refetchCreators();
      } else {
        await feedQuery.refreshFeed();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [activeTab, refetchCreators, feedQuery]);

  const posts = useMemo(() => {
    if (!feedQuery.data?.pages) return [];
    return feedQuery.data.pages.flatMap((page) => page.posts);
  }, [feedQuery.data]);

  // Create varied height patterns for visual interest
  const heightPattern = [1.0, 1.35, 1.15, 1.0, 1.4, 1.0, 1.2, 1.0, 1.3, 1.1];

  const gridItems = useMemo((): GridItem[] => {
    if (activeTab === 'POSTS') {
      return posts.map((post: PostWithCreator, index: number) => ({
        id: post.id,
        type: 'post' as const,
        imageUri: post.mediaUrl,
        label: post.creator.displayName || post.creator.username,
        sublabel: post.caption,
        distanceText: post.distanceMeters ? formatDistance(post.distanceMeters) : undefined,
        heightMultiplier: heightPattern[index % heightPattern.length],
        postId: post.id,
      }));
    }

    return nearbyCreators.map(
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
  }, [activeTab, posts, nearbyCreators]);

  // Split items into two columns for masonry effect
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: GridItem[] = [];
    const right: GridItem[] = [];
    let leftHeight = 0;
    let rightHeight = 0;
    // Distribute by shortest column for better visual balance
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
      </View>

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

      {/* Masonry Grid */}
      {((activeTab === 'CREATORS' && creatorsLoading) || (activeTab === 'POSTS' && feedQuery.isLoading)) ? (
        <ExploreSkeleton />
      ) : (
        <FlatList
          data={gridItems.length > 0 ? [{ key: 'masonry' }] : []}
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
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.textTertiary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {activeTab === 'CREATORS'
                  ? 'No creators nearby'
                  : 'Nothing to explore yet'}
              </Text>
            </View>
          }
        />
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
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
  listContent: {
    paddingHorizontal: SPACING.md,
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
    backgroundImage: undefined,
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
  emptyState: {
    paddingVertical: SPACING.xl * 3,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
});
