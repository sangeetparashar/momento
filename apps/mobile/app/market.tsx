import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import { TickerBanner } from '@/components/features';
import { useCreatorLeaderboard } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';
import type { CreatorLeaderboardEntry } from '@momento/shared';

type MarketTab = 'TRENDING' | 'MOST ACTIVE' | 'TOP';

interface MarketCreator extends CreatorLeaderboardEntry {
  rank: number;
}

export default function MarketScreen() {
  const router = useRouter();
  const leaderboard = useCreatorLeaderboard();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<MarketTab>('TRENDING');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleRefresh = useCallback(() => {
    leaderboard.refetch();
  }, [leaderboard]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Derive ticker banner items from real data
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

  // Build combined + deduplicated creator list for the main table
  const allCreators = useMemo((): MarketCreator[] => {
    if (!leaderboard.data) return [];
    const seen = new Set<string>();
    const combined: CreatorLeaderboardEntry[] = [];
    for (const c of [...(leaderboard.data.trending || []), ...(leaderboard.data.mostActive || [])]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        combined.push(c);
      }
    }
    return combined.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [leaderboard.data]);

  const filteredCreators = useMemo(() => {
    let creators = [...allCreators];

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      creators = creators.filter(
        (c) =>
          (c.tokenSymbol || '').toLowerCase().includes(query) ||
          (c.username || '').toLowerCase().includes(query) ||
          (c.displayName || '').toLowerCase().includes(query),
      );
    }

    // Sort by tab
    switch (activeTab) {
      case 'TRENDING':
        creators.sort((a, b) => b.topPostLikeCount - a.topPostLikeCount);
        break;
      case 'MOST ACTIVE':
        creators.sort((a, b) => b.postCount - a.postCount);
        break;
      case 'TOP':
        creators.sort((a, b) => b.followerCount - a.followerCount);
        break;
    }

    // Re-rank after sorting
    return creators.map((c, i) => ({ ...c, rank: i + 1 }));
  }, [allCreators, searchQuery, activeTab]);

  const handleRowPress = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  const handleBuyPress = useCallback(
    (creator: MarketCreator) => {
      // Prefer a direct token deep-link when the mint is available (backend may
      // add `tokenMint` to the leaderboard row per CONTRACTS-P3B §f.1); else
      // fall back to the creator profile, whose TOKEN tab hosts buy/sell.
      const mint = (creator as { tokenMint?: string }).tokenMint;
      if (mint) {
        router.push(`/token/${mint}`);
      } else {
        router.push(`/creator/${creator.id}`);
      }
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav Bar */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.navTitle}>Market</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={leaderboard.isRefetching}
            onRefresh={handleRefresh}
            tintColor={COLORS.textTertiary}
          />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search creators..."
            placeholderTextColor={COLORS.textTertiary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Ticker Banners */}
        {trendingItems.length > 0 && (
          <TickerBanner title="TRENDING" items={trendingItems} valueSuffix=" likes" />
        )}
        {creatorsItems.length > 0 && (
          <TickerBanner title="MOST ACTIVE" items={creatorsItems} valueSuffix=" posts" />
        )}

        {/* Tab Filters */}
        <View style={styles.tabsContainer}>
          {(['TRENDING', 'MOST ACTIVE', 'TOP'] as MarketTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Loading state */}
        {leaderboard.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <View style={styles.tokenListContainer}>
            {/* Header */}
            <View style={styles.listHeaderRow}>
              <Text style={[styles.listHeaderCell, styles.rankColumn]}>#</Text>
              <Text style={[styles.listHeaderCell, styles.tokenColumn]}>CREATOR</Text>
              <Text style={[styles.listHeaderCell, styles.changeColumn]}>TOP POST</Text>
              <Text style={[styles.listHeaderCell, styles.mcapColumn]}>POSTS</Text>
            </View>

            {/* Rows */}
            {filteredCreators.map((creator) => {
              const symbol = creator.tokenSymbol || creator.username?.toUpperCase() || '?';
              return (
                <View key={creator.id}>
                  <Pressable onPress={() => handleRowPress(creator.id)} style={styles.tokenRow}>
                    <Text style={[styles.rankText, styles.rankColumn]}>{creator.rank}</Text>
                    <View style={[styles.tokenColumn, styles.tokenInfo]}>
                      <Avatar uri={creator.avatarUrl} name={creator.displayName || creator.username || '?'} size="sm" />
                      <View>
                        <Text style={styles.tokenSymbol}>${symbol}</Text>
                        <Text style={styles.tokenName} numberOfLines={1}>
                          {creator.displayName || creator.username || 'Creator'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.changeText, styles.changeColumn, { color: COLORS.success }]}>
                      {formatNumber(creator.topPostLikeCount)} likes
                    </Text>
                    <Text style={[styles.mcapText, styles.mcapColumn]}>
                      {formatNumber(creator.postCount)}
                    </Text>
                  </Pressable>

                  {/* Expanded Row */}
                  {expandedRow === creator.id && (
                    <View style={styles.expandedRow}>
                      <Pressable
                        style={styles.expandedCreator}
                        onPress={() => router.push(`/creator/${creator.id}`)}
                      >
                        <Avatar uri={creator.avatarUrl} name={creator.displayName || creator.username || '?'} size="md" />
                        <View style={styles.expandedCreatorInfo}>
                          <Text style={styles.expandedCreatorName}>
                            {creator.displayName || creator.username}
                          </Text>
                          <Text style={styles.expandedFollowers}>
                            {formatNumber(creator.followerCount)} followers
                          </Text>
                          <Text style={styles.expandedViewProfile}>View Profile →</Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => handleBuyPress(creator)} style={styles.buyButton}>
                        <Text style={styles.buyButtonText}>BUY</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            {filteredCreators.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No creators found</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  backButton: {
    padding: SPACING.xs,
  },
  navTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  navSpacer: {
    width: 36,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    padding: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    gap: SPACING.xs,
  },
  tabButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    fontWeight: '700',
  },
  tabTextActive: {
    color: COLORS.background,
  },
  loadingState: {
    paddingVertical: SPACING.xl * 3,
    alignItems: 'center',
  },
  tokenListContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    marginHorizontal: SPACING.md,
    overflow: 'hidden',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listHeaderCell: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rankColumn: {
    width: 30,
  },
  tokenColumn: {
    flex: 2,
  },
  changeColumn: {
    flex: 1,
    textAlign: 'right',
  },
  mcapColumn: {
    flex: 1,
    textAlign: 'right',
  },
  rankText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tokenSymbol: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  tokenName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  changeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  mcapText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  expandedCreator: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  expandedCreatorInfo: {
    flex: 1,
  },
  expandedCreatorName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  expandedFollowers: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  expandedViewProfile: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  buyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADII.full,
  },
  buyButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontWeight: '800',
  },
  emptyState: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
