import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { TickerBanner, ComingSoonModal } from '@/components/features';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { DUMMY_TRENDING_TOKENS, DUMMY_CREATORS_TO_WATCH } from '@momento/shared';

type MarketTab = 'TRENDING' | '24H GAINERS' | 'TOP';

interface MarketToken {
  rank: number;
  symbol: string;
  name: string;
  change24h: number;
  marketCap: number;
  price: number;
}

const TRENDING_ITEMS = DUMMY_TRENDING_TOKENS.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

const CREATORS_ITEMS = DUMMY_CREATORS_TO_WATCH.map((t) => ({
  symbol: t.symbol,
  change: t.change,
}));

const DUMMY_MARKET_TOKENS: MarketToken[] = [
  { rank: 1, symbol: 'DEEL', name: 'Deel Token', change24h: 12.5, marketCap: 2500000, price: 4.25 },
  { rank: 2, symbol: 'AURA', name: 'Aura Coin', change24h: 24.1, marketCap: 1800000, price: 3.12 },
  { rank: 3, symbol: 'NAAN', name: 'Naan Token', change24h: 8.7, marketCap: 1500000, price: 2.80 },
  { rank: 4, symbol: 'TASH', name: 'Tash Coin', change24h: 45.2, marketCap: 1200000, price: 1.95 },
  { rank: 5, symbol: 'TEAH', name: 'Teah Token', change24h: 18.9, marketCap: 950000, price: 1.40 },
  { rank: 6, symbol: 'TWSH', name: 'Twsh Coin', change24h: 7.3, marketCap: 800000, price: 0.98 },
  { rank: 7, symbol: 'BELLE', name: 'Belle Token', change24h: -3.2, marketCap: 650000, price: 0.75 },
  { rank: 8, symbol: 'SEAM', name: 'Seam Coin', change24h: -1.5, marketCap: 520000, price: 0.62 },
  { rank: 9, symbol: 'CHCTS', name: 'Chcts Token', change24h: -2.1, marketCap: 400000, price: 0.45 },
  { rank: 10, symbol: 'VIBE', name: 'Vibe Token', change24h: 5.8, marketCap: 350000, price: 0.38 },
];

export default function MarketScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<MarketTab>('TRENDING');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // Market uses dummy data; simulate refresh delay
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const filteredTokens = useMemo(() => {
    let tokens = [...DUMMY_MARKET_TOKENS];

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tokens = tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(query) ||
          t.name.toLowerCase().includes(query)
      );
    }

    // Sort by tab
    switch (activeTab) {
      case 'TRENDING':
        tokens.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
        break;
      case '24H GAINERS':
        tokens.sort((a, b) => b.change24h - a.change24h);
        break;
      case 'TOP':
        tokens.sort((a, b) => b.marketCap - a.marketCap);
        break;
    }

    return tokens;
  }, [searchQuery, activeTab]);

  const handleRowPress = useCallback((symbol: string) => {
    setExpandedRow((prev) => (prev === symbol ? null : symbol));
  }, []);

  const handleBuyPress = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav Bar */}
      <View style={styles.navBar}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons
            name="chevron-back"
            size={28}
            color={COLORS.textPrimary}
          />
        </Pressable>
        <Text style={styles.navTitle}>Market</Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={18}
            color={COLORS.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tokens..."
            placeholderTextColor={COLORS.textTertiary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons
                name="close-circle"
                size={18}
                color={COLORS.textTertiary}
              />
            </Pressable>
          )}
        </View>

        {/* Ticker Banners */}
        <TickerBanner title="TRENDING" items={TRENDING_ITEMS} />
        <TickerBanner
          title="CREATORS TO WATCH"
          items={CREATORS_ITEMS}
        />

        {/* Tab Filters */}
        <View style={styles.tabsContainer}>
          {(['TRENDING', '24H GAINERS', 'TOP'] as MarketTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Token List */}
        <View style={styles.tokenListContainer}>
          {/* Header */}
          <View style={styles.listHeaderRow}>
            <Text style={[styles.listHeaderCell, styles.rankColumn]}>#</Text>
            <Text style={[styles.listHeaderCell, styles.tokenColumn]}>
              TOKEN
            </Text>
            <Text style={[styles.listHeaderCell, styles.changeColumn]}>
              24HR
            </Text>
            <Text style={[styles.listHeaderCell, styles.mcapColumn]}>
              MCAP
            </Text>
          </View>

          {/* Rows */}
          {filteredTokens.map((token) => (
            <View key={token.symbol}>
              <Pressable
                onPress={() => handleRowPress(token.symbol)}
                style={styles.tokenRow}
              >
                <Text style={[styles.rankText, styles.rankColumn]}>
                  {token.rank}
                </Text>
                <View style={[styles.tokenColumn, styles.tokenInfo]}>
                  <View style={styles.tokenAvatar}>
                    <Text style={styles.tokenAvatarText}>
                      {token.symbol.charAt(0)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenName} numberOfLines={1}>
                      {token.name}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.changeText,
                    styles.changeColumn,
                    {
                      color:
                        token.change24h >= 0
                          ? COLORS.success
                          : COLORS.error,
                    },
                  ]}
                >
                  {token.change24h >= 0 ? '+' : ''}
                  {token.change24h.toFixed(1)}%
                </Text>
                <Text style={[styles.mcapText, styles.mcapColumn]}>
                  {formatNumber(token.marketCap)}
                </Text>
              </Pressable>

              {/* Expanded Row */}
              {expandedRow === token.symbol && (
                <View style={styles.expandedRow}>
                  <View style={styles.expandedInfo}>
                    <Text style={styles.expandedLabel}>Price</Text>
                    <Text style={styles.expandedValue}>
                      {formatCurrency(token.price)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleBuyPress}
                    style={styles.buyButton}
                  >
                    <Text style={styles.buyButtonText}>BUY</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

          {filteredTokens.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tokens found</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

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
    flex: 1.2,
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
  tokenAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenAvatarText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
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
    ...TYPOGRAPHY.bodySmall,
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
  expandedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  expandedLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
  expandedValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
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
