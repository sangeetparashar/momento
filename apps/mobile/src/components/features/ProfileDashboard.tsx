import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import {
  PillTabs,
  StatsCard,
  PerformanceChart,
  PortfolioTable,
  TokenSwapWidget,
} from '@/components/composites';
import type { PortfolioRowProps } from '@/components/composites';
import { ComingSoonModal } from '@/components/features/ComingSoonModal';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

interface ProfileDashboardProps {
  /** User data from useUserProfile. */
  user: any;
  /** Whether the user is a creator. */
  isCreator: boolean;
  /** Wallet balance data. */
  walletBalance?: any;
  /** Whether data is loading. */
  isLoading: boolean;
  /** Pull-to-refresh handler. */
  onRefresh: () => void;
  /** Whether currently refreshing. */
  refreshing: boolean;
  /** Settings press handler. */
  onSettingsPress: () => void;
}

// Sample portfolio data until real API exists
const SAMPLE_CHART_DATA = [
  { x: 0, y: 45 }, { x: 1, y: 42 }, { x: 2, y: 50 },
  { x: 3, y: 55 }, { x: 4, y: 52 }, { x: 5, y: 60 },
  { x: 6, y: 75 }, { x: 7, y: 70 }, { x: 8, y: 80 },
  { x: 9, y: 85 }, { x: 10, y: 82 }, { x: 11, y: 95 },
];

/**
 * Financial dashboard profile layout (matches Figma).
 *
 * Replaces the social-media-style profile with:
 * - Name + WALLET pill
 * - Stats cards (24H CHANGE / EARNINGS TO DATE)
 * - Portfolio performance chart
 * - Token portfolio table with BUY/SELL
 * - Token swap widget
 *
 * Rendered alongside old profile with a feature toggle in profile.tsx.
 *
 * @see docs/design/screens/user-account-1.png
 * @see docs/design/screens/creator-account-1.png
 */
export function ProfileDashboard({
  user,
  isCreator,
  walletBalance,
  isLoading,
  onRefresh,
  refreshing,
  onSettingsPress,
}: ProfileDashboardProps) {
  const router = useRouter();
  const [chartTimeRange, setChartTimeRange] = useState('1Y');
  const [showComingSoon, setShowComingSoon] = useState(false);

  const displayName = user?.displayName || user?.username || 'PROFILE';

  // Derive stats from wallet balance (placeholder fallbacks)
  const change24h = walletBalance?.change24h ?? '0.9%';
  const earnings = walletBalance?.totalEarnings ?? '12.2K';

  // Wire BUY/SELL/swap to ComingSoonModal until trading is live
  const handleComingSoon = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  // Build portfolio rows with real handlers
  const portfolioRows: PortfolioRowProps[] = useMemo(() => [
    { symbol: 'DEEL', avatarColor: '#8B5CF6', change: '17%', changePositive: true, price: '10,631USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'BELLE', avatarColor: '#EC4899', change: '0.5%', changePositive: true, price: '10.67M USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'NAAN', avatarColor: '#F97316', change: '3%', changePositive: false, price: '3,050USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'AURA', avatarColor: '#06B6D4', change: '2%', changePositive: true, price: '17,019USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'SEAM', avatarColor: '#10B981', change: '267%', changePositive: true, price: '93,780USD', onBuy: handleComingSoon, onSell: handleComingSoon },
  ], [handleComingSoon]);

  // Creator header tabs act as action buttons, not persistent tab state
  const handleCreatorAction = useCallback((key: string) => {
    if (key === 'edit') router.push('/edit-profile');
    else if (key === 'post') router.push('/create-post');
    else if (key === 'account') onSettingsPress();
  }, [router, onSettingsPress]);

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header: Creator action pills OR settings gear */}
        {isCreator ? (
          <View style={styles.creatorHeader}>
            <PillTabs
              tabs={[
                { key: 'edit', label: 'Edit Profile' },
                { key: 'post', label: 'New Post' },
                { key: 'account', label: 'Account' },
              ]}
              activeTab="" // No persistent active state — these are action buttons
              onTabChange={handleCreatorAction}
              style={{ flex: 1 }}
            />
          </View>
        ) : (
          <View style={styles.userHeader}>
            <Pressable onPress={onSettingsPress} hitSlop={8}>
              <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* User Name */}
        <Text
          variant="h1"
          align="center"
          style={styles.userName}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {displayName}
        </Text>

        {/* WALLET pill */}
        <Pressable
          style={styles.walletPill}
          onPress={() => router.push('/wallet')}
        >
          <Text variant="label" style={styles.walletPillText}>
            WALLET
          </Text>
        </Pressable>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <StatsCard
            label="24H CHANGE"
            value={change24h}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
          <StatsCard
            label="EARNINGS TO DATE"
            value={earnings}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
        </View>

        {/* Portfolio Chart */}
        <PerformanceChart
          title="PORTFOLIO PERFORMANCE"
          data={SAMPLE_CHART_DATA}
          timeRange={chartTimeRange}
          onTimeRangeChange={setChartTimeRange}
        />

        {/* Portfolio Table */}
        <View style={styles.portfolioSection}>
          <PortfolioTable
            title="PORTFOLIO"
            rows={portfolioRows}
            showSellColumn
            showBuyColumn
          />
        </View>

        {/* Token Swap */}
        <View style={styles.swapSection}>
          <TokenSwapWidget
            onSelectPayToken={handleComingSoon}
            onSelectReceiveToken={handleComingSoon}
          />
        </View>
      </ScrollView>

      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Trading Coming Soon!"
        message="Token trading will be available in the next update."
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // Headers
  creatorHeader: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  userHeader: {
    alignItems: 'flex-end',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },

  // Name
  userName: {
    fontSize: 28,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.lg,
  },

  // Wallet pill
  walletPill: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: RADII.full,
    marginBottom: SPACING.xl,
  },
  walletPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: 28,
  },

  // Portfolio
  portfolioSection: {
    marginTop: SPACING.xl,
  },

  // Swap
  swapSection: {
    marginTop: 28,
  },
});
