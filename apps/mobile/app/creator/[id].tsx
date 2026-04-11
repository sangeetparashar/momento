import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  useWindowDimensions,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
// PagerView removed — using simple tab switching to avoid native module dependency
import { Text, Avatar } from '@/components/primitives';
import { PillTabs, StatsCard, BuySellPills, PerformanceChart } from '@/components/composites';
import { ComingSoonModal, CreatorProfileSkeleton } from '@/components/features';
import { useCreatorProfile } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { apiService } from '@/services/api';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber, formatTimeAgo } from '@/utils/formatters';

const COLUMN_GAP = 2;
const HEIGHT_PATTERN = [1.0, 1.35, 1.15, 1.0, 1.4, 1.0, 1.2, 1.0, 1.3, 1.1];

type ProfileTab = 'PROFILE' | 'POSTS' | 'TOKEN';
const TABS: ProfileTab[] = ['PROFILE', 'POSTS', 'TOKEN'];

function splitMasonryColumns(posts: any[]) {
  const left: { post: any; height: number }[] = [];
  const right: { post: any; height: number }[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  posts.forEach((post, index) => {
    const h = HEIGHT_PATTERN[index % HEIGHT_PATTERN.length];
    if (leftHeight <= rightHeight) {
      left.push({ post, height: h });
      leftHeight += h;
    } else {
      right.push({ post, height: h });
      rightHeight += h;
    }
  });
  return { left, right };
}

export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const ITEM_WIDTH = useMemo(() => (SCREEN_WIDTH - COLUMN_GAP) / 2, [SCREEN_WIDTH]);
  const HERO_HEIGHT = useMemo(() => SCREEN_HEIGHT * 0.55, [SCREEN_HEIGHT]);
  const { profile, isLoading, isFollowing, toggleFollow } = useCreatorProfile(id);
  const { user: currentUser } = useUserProfile();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('PROFILE');
  const [chartTimeRange, setChartTimeRange] = useState('1Y');
  const isOwnProfile = !!currentUser?.id && !!profile?.id && currentUser.id === profile.id;

  // Sample chart data until real token price API exists
  const chartData = useMemo(() => [
    { x: 0, y: 20 }, { x: 1, y: 18 }, { x: 2, y: 25 },
    { x: 3, y: 30 }, { x: 4, y: 28 }, { x: 5, y: 35 },
    { x: 6, y: 50 }, { x: 7, y: 45 }, { x: 8, y: 55 },
    { x: 9, y: 60 }, { x: 10, y: 58 }, { x: 11, y: 70 },
  ], []);

  // Placeholder token stats
  const tokenData = useMemo(() => ({
    price: '0.004',
    change24h: '17%',
    changePositive: true,
    marketCap: '10.6K',
  }), []);

  useEffect(() => {
    if (isOwnProfile) {
      router.replace('/(tabs)/profile');
    }
  }, [isOwnProfile, router]);

  const postsQuery = useInfiniteQuery({
    queryKey: ['creator', id, 'posts'],
    queryFn: ({ pageParam }) =>
      apiService.get<{ posts: any[]; nextCursor?: string; hasMore: boolean }>(
        `/creators/${id}/posts`,
        { ...(pageParam ? { cursor: pageParam as string } : {}) }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!id,
  });

  const creatorPosts = postsQuery.data?.pages.flatMap(p => p.posts) ?? [];

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTabChange = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
  }, []);

  const handleEndReached = useCallback(() => {
    if (postsQuery.hasNextPage && !postsQuery.isFetchingNextPage) {
      postsQuery.fetchNextPage();
    }
  }, [postsQuery]);

  const postColumns = useMemo(() => splitMasonryColumns(creatorPosts), [creatorPosts]);

  // ─── PROFILE TAB ───
  const renderProfileTab = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 400) {
          handleEndReached();
        }
      }}
      scrollEventThrottle={400}
      nestedScrollEnabled
    >
      {/* Full-bleed hero image */}
      <View style={[styles.heroContainer, { height: HERO_HEIGHT }]}>
        {profile?.bannerUrl || profile?.avatarUrl ? (
          <Image
            source={{ uri: profile.bannerUrl || profile.avatarUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="disk"
            placeholder={{ blurhash: 'L6PZfSjE.AyE_3t7t7R**0o#DgR4' }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.backgroundTertiary }]} />
        )}
        {/* Gradient overlay at bottom */}
        <View style={styles.heroGradient} />
        {/* Name + verified dot overlaid at bottom */}
        <View style={styles.heroOverlay}>
          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>
              {profile?.displayName || profile?.username || 'Creator'}
            </Text>
            {profile?.kycStatus === 'VERIFIED' && (
              <View style={styles.verifiedDot} />
            )}
          </View>
          {profile?.tokenSymbol && (
            <Text style={styles.heroToken}>${profile.tokenSymbol}</Text>
          )}
          {profile?.bio && (
            <Text style={styles.heroBio} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}
        </View>
      </View>

      {/* Masonry post grid */}
      {creatorPosts.length > 0 ? (
        <View style={styles.masonryContainer}>
          <View style={styles.masonryColumn}>
            {postColumns.left.map(({ post, height }) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post/${post.id}`)}
                style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
              >
                {post.mediaUrl ? (
                  <Image
                    source={{ uri: post.mediaUrl }}
                    style={styles.masonryImage}
                    contentFit="cover"
                    cachePolicy="disk"
                    recyclingKey={post.mediaUrl}
                  />
                ) : (
                  <View style={styles.masonryTextItem}>
                    <Text style={styles.masonryText} numberOfLines={6}>
                      {post.content || post.caption}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          <View style={styles.masonryColumn}>
            {postColumns.right.map(({ post, height }) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post/${post.id}`)}
                style={[styles.masonryItem, { height: ITEM_WIDTH * height }]}
              >
                {post.mediaUrl ? (
                  <Image
                    source={{ uri: post.mediaUrl }}
                    style={styles.masonryImage}
                    contentFit="cover"
                    cachePolicy="disk"
                    recyclingKey={post.mediaUrl}
                  />
                ) : (
                  <View style={styles.masonryTextItem}>
                    <Text style={styles.masonryText} numberOfLines={6}>
                      {post.content || post.caption}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : postsQuery.isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={48} color={COLORS.textTertiary} />
          <Text style={styles.emptyText}>No posts yet</Text>
        </View>
      )}

      {postsQuery.isFetchingNextPage && (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}
    </ScrollView>
  );

  // ─── POSTS TAB (feed-style) ───
  const renderPostItem = useCallback(({ item: post }: { item: any }) => (
    <Pressable
      onPress={() => router.push(`/post/${post.id}`)}
      style={styles.feedPost}
    >
      {/* Avatar + name + time */}
      <View style={styles.feedPostHeader}>
        <Avatar
          uri={profile?.avatarUrl}
          name={profile?.displayName || profile?.username}
          size="sm"
        />
        <View style={styles.feedPostMeta}>
          <Text style={styles.feedPostName}>
            {profile?.displayName || profile?.username}
          </Text>
          <Text style={styles.feedPostTime}>
            {formatTimeAgo(post.createdAt)}
          </Text>
        </View>
      </View>
      {/* Caption */}
      {(post.caption || post.content) && (
        <Text style={styles.feedPostCaption} numberOfLines={4}>
          {post.caption || post.content}
        </Text>
      )}
      {/* Image */}
      {post.mediaUrl && (
        <Image
          source={{ uri: post.mediaUrl }}
          style={styles.feedPostImage}
          contentFit="cover"
          cachePolicy="disk"
          recyclingKey={post.mediaUrl}
        />
      )}
    </Pressable>
  ), [profile, router]);

  const renderPostsTab = () => (
    <FlatList
      data={creatorPosts}
      keyExtractor={(item) => item.id}
      renderItem={renderPostItem}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.feedContent}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      nestedScrollEnabled
      ListEmptyComponent={
        postsQuery.isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        )
      }
    />
  );

  // ─── TOKEN TAB ───
  const renderTokenTab = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tokenContent}
      nestedScrollEnabled
    >
      {/* Token symbol hero */}
      <Text style={styles.tokenHero}>
        ${profile?.tokenSymbol || '???'}
      </Text>

      {/* BUY / SELL pills */}
      <BuySellPills
        onBuy={() => setShowComingSoon(true)}
        onSell={() => setShowComingSoon(true)}
        style={{ marginTop: SPACING.xl }}
      />

      {/* Stats row — 3 across */}
      <View style={styles.tokenStatsRow}>
        <StatsCard
          label="PRICE"
          value={tokenData.price}
          variant="inline"
        />
        <StatsCard
          label="24H CHANGE"
          value={tokenData.change24h}
          variant="inline"
          valueColor={tokenData.changePositive ? 'positive' : 'negative'}
        />
        <StatsCard
          label="MARKET CAP"
          value={tokenData.marketCap}
          variant="inline"
        />
      </View>

      {/* Divider */}
      <View style={styles.tokenDivider} />

      {/* Performance chart */}
      <PerformanceChart
        title="TOKEN PERFORMANCE"
        data={chartData}
        timeRange={chartTimeRange}
        onTimeRangeChange={setChartTimeRange}
        style={{ width: '100%' }}
      />

      {/* Follow CTA */}
      {!isOwnProfile && (
        <Pressable
          onPress={toggleFollow}
          style={[styles.tokenFollowButton, isFollowing && styles.tokenFollowingButton]}
        >
          <Text style={[styles.tokenFollowText, isFollowing && styles.tokenFollowingText]}>
            {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation + Tab Bar */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <PillTabs
          tabs={[
            { key: 'PROFILE', label: 'Profile' },
            { key: 'POSTS', label: 'Posts' },
            { key: 'TOKEN', label: 'Token' },
          ]}
          activeTab={activeTab}
          onTabChange={(key) => handleTabChange(key as ProfileTab)}
          style={{ flex: 1 }}
        />
      </View>

      {/* Content */}
      {isLoading ? (
        <CreatorProfileSkeleton />
      ) : (
        <View style={{ flex: 1 }}>
          {activeTab === 'PROFILE' && renderProfileTab()}
          {activeTab === 'POSTS' && renderPostsTab()}
          {activeTab === 'TOKEN' && renderTokenTab()}
        </View>
      )}

      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ─── Nav + Tabs ───
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  backButton: {
    padding: SPACING.xs,
    width: 32,
  },
  tabBar: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingRight: SPACING.sm,
  },
  tabItem: {
    paddingVertical: SPACING.xs,
  },
  tabText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  tabTextActive: {
    color: COLORS.textPrimary,
  },

  // ─── PROFILE TAB: Hero ───
  heroContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: COLORS.background,
    opacity: 0.7,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '700',
    textTransform: 'none',
  },
  verifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  heroToken: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  heroBio: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },

  // ─── PROFILE TAB: Grid ───
  masonryContainer: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
    paddingTop: SPACING.xs,
  },
  masonryColumn: {
    flex: 1,
    gap: COLUMN_GAP,
  },
  masonryItem: {
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  masonryImage: {
    width: '100%',
    height: '100%',
  },
  masonryTextItem: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    justifyContent: 'center',
  },
  masonryText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },

  // ─── POSTS TAB (feed-style) ───
  feedContent: {
    paddingBottom: SPACING.xl,
  },
  feedPost: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  feedPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  feedPostMeta: {
    flex: 1,
  },
  feedPostName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  feedPostTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  feedPostCaption: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 20,
    textTransform: 'none',
  },
  feedPostImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },

  // ─── TOKEN TAB ───
  tokenContent: {
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  tokenHero: {
    ...TYPOGRAPHY.monoLarge,
    fontSize: 32,
    color: COLORS.textPrimary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tokenStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: SPACING.xl,
  },
  tokenDivider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xl,
  },
  // ─── Old token styles (kept, no longer referenced) ───
  tokenButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    width: '100%',
  },
  tokenBuyButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.textPrimary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
  },
  tokenBuyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tokenSellButton: {
    flex: 1,
    backgroundColor: COLORS.textPrimary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
  },
  tokenSellText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tokenStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: SPACING.xl,
  },
  tokenStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  tokenStatLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontSize: 9,
    letterSpacing: 1,
  },
  tokenStatValue: {
    ...TYPOGRAPHY.mono,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 18,
    marginTop: SPACING.xs,
  },
  tokenChartContainer: {
    width: '100%',
    marginTop: SPACING.xl,
  },
  tokenChartLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  tokenChart: {
    height: 160,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenChartPlaceholder: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  tokenFollowButton: {
    width: '100%',
    backgroundColor: COLORS.textPrimary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  tokenFollowingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.textTertiary,
  },
  tokenFollowText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tokenFollowingText: {
    color: COLORS.textPrimary,
  },

  // ─── Shared ───
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 3,
    gap: SPACING.md,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  loadingMore: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
});
