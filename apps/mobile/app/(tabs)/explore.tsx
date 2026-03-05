import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives';
import { useFeed } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { PostWithCreator, PublicCreator } from '@momento/shared';

type ExploreTab = 'CREATORS' | 'POSTS';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = SPACING.xs;
const ITEM_WIDTH = (SCREEN_WIDTH - SPACING.md * 2 - COLUMN_GAP) / 2;

interface GridItem {
  id: string;
  type: 'post' | 'creator';
  imageUri?: string;
  label?: string;
  sublabel?: string;
  heightMultiplier: number;
  postId?: string;
  creatorId?: string;
}

export default function ExploreScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExploreTab>('CREATORS');
  const feedQuery = useFeed();

  const posts = useMemo(() => {
    if (!feedQuery.data?.pages) return [];
    return feedQuery.data.pages.flatMap((page) => page.posts);
  }, [feedQuery.data]);

  const gridItems = useMemo((): GridItem[] => {
    if (activeTab === 'POSTS') {
      return posts.map((post: PostWithCreator, index: number) => ({
        id: post.id,
        type: 'post' as const,
        imageUri: post.mediaUrl,
        label: post.creator.displayName || post.creator.username,
        sublabel: post.caption,
        heightMultiplier: index % 3 === 0 ? 1.3 : 1.0,
        postId: post.id,
      }));
    }

    // Derive unique creators from posts
    const creatorsMap = new Map<string, PublicCreator>();
    posts.forEach((post: PostWithCreator) => {
      if (!creatorsMap.has(post.creator.id)) {
        creatorsMap.set(post.creator.id, post.creator);
      }
    });

    return Array.from(creatorsMap.values()).map(
      (creator: PublicCreator, index: number) => ({
        id: creator.id,
        type: 'creator' as const,
        imageUri: creator.avatarUrl || creator.bannerUrl,
        label: creator.displayName || creator.username,
        sublabel: creator.tokenSymbol
          ? `$${creator.tokenSymbol}`
          : undefined,
        heightMultiplier: index % 3 === 0 ? 1.3 : 1.0,
        creatorId: creator.id,
      })
    );
  }, [activeTab, posts]);

  // Split items into two columns for masonry effect
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: GridItem[] = [];
    const right: GridItem[] = [];
    gridItems.forEach((item, index) => {
      if (index % 2 === 0) {
        left.push(item);
      } else {
        right.push(item);
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

  const renderGridItem = useCallback(
    (item: GridItem) => {
      const height = ITEM_WIDTH * item.heightMultiplier;
      return (
        <Pressable
          key={item.id}
          onPress={() => handleItemPress(item)}
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
          {item.label && (
            <View style={styles.gridOverlay}>
              <Text style={styles.gridLabel} numberOfLines={1}>
                {item.label}
              </Text>
              {item.sublabel && (
                <Text style={styles.gridSublabel} numberOfLines={1}>
                  {item.sublabel}
                </Text>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [handleItemPress]
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
      <FlatList
        data={[{ key: 'masonry' }]}
        renderItem={() => (
          <View style={styles.masonryContainer}>
            <View style={styles.column}>
              {leftColumn.map(renderGridItem)}
            </View>
            <View style={styles.column}>
              {rightColumn.map(renderGridItem)}
            </View>
          </View>
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nothing to explore yet</Text>
          </View>
        }
      />
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
    borderRadius: RADII.md,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  emptyState: {
    paddingVertical: SPACING.xl * 3,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
});
