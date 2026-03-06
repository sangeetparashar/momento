import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { TickerBanner, PostCard, FeedSkeleton } from '@/components/features';
import { Text } from '@/components/primitives';
import { useFeed } from '@/hooks';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { DUMMY_TRENDING_TOKENS, DUMMY_CREATORS_TO_WATCH } from '@momento/shared';
import type { PostWithCreator } from '@momento/shared';

// Map shared constants to TickerBanner's expected {symbol, change} format
const TRENDING_ITEMS = DUMMY_TRENDING_TOKENS.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

const CREATORS_ITEMS = DUMMY_CREATORS_TO_WATCH.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

export default function HomeScreen() {
  const router = useRouter();
  const feedQuery = useFeed();

  const posts = useMemo(() => {
    if (!feedQuery.data?.pages) return [];
    return feedQuery.data.pages.flatMap((page) => page.posts);
  }, [feedQuery.data]);

  const handleTickerPress = useCallback(() => {
    router.push('/market');
  }, [router]);

  const handleEndReached = useCallback(() => {
    if (feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [feedQuery]);

  const handleRefresh = useCallback(() => {
    feedQuery.refetch();
  }, [feedQuery]);

  const renderItem = useCallback(
    ({ item }: { item: PostWithCreator }) => <PostCard post={item} />,
    []
  );

  const keyExtractor = useCallback(
    (item: PostWithCreator) => item.id,
    []
  );

  const ListHeader = useCallback(
    () => (
      <View style={styles.headerContainer}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoRow}>
          <Text style={styles.logo}>M O M E N T O</Text>
        </Animated.View>
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
        <View style={styles.divider} />
      </View>
    ),
    [handleTickerPress]
  );

  const ListEmpty = useCallback(
    () =>
      feedQuery.isLoading ? (
        <FeedSkeleton />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No posts yet</Text>
          <Text style={styles.emptySubtext}>
            Follow creators to see their posts here
          </Text>
        </View>
      ),
    [feedQuery.isLoading]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlashList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={500}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    paddingBottom: SPACING.sm,
  },
  logoRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  logo: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    letterSpacing: 6,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  emptyState: {
    paddingVertical: SPACING.xl * 3,
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
