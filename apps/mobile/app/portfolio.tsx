import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import {
  StatsCard,
  PerformanceChart,
  PortfolioTable,
  TokenSwapWidget,
} from '@/components/composites';
import type { PortfolioRowProps } from '@/components/composites';
import { ComingSoonModal } from '@/components/features';
import { useWalletBalance } from '@/hooks';
import { usePortfolioSnapshots } from '@/hooks/usePriceHistory';
import { COLORS, SPACING } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

/**
 * Portfolio screen — extracted from ProfileDashboard.
 *
 * Shows: stats cards, performance chart, token table, swap widget.
 * Accessed via the PORTFOLIO pill button on the profile page.
 *
 * @see docs/design/screens/user-account-1.png
 */
export default function PortfolioScreen() {
  const router = useRouter();
  const { data: walletBalance, isLoading: balanceLoading } = useWalletBalance();
  const [chartTimeRange, setChartTimeRange] = useState('1M');
  const [showComingSoon, setShowComingSoon] = useState(false);
  const { data: snapshots, isLoading: snapshotsLoading } = usePortfolioSnapshots(
    chartTimeRange as '24H' | '7D' | '1M' | '3M' | '1Y'
  );

  const change24h = walletBalance?.change24h;
  const change24hStr = change24h != null
    ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(1)}%`
    : '—';
  const earnings = walletBalance?.earningsToDate;
  const earningsStr = earnings != null
    ? `$${earnings >= 1000 ? (earnings / 1000).toFixed(1) + 'K' : earnings.toFixed(2)}`
    : '—';

  const chartData = useMemo(() => {
    if (!snapshots || snapshots.length < 2) return [];
    return snapshots.map((pt) => ({ x: pt.t, y: pt.p }));
  }, [snapshots]);

  const handleComingSoon = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  const portfolioRows: PortfolioRowProps[] = useMemo(() => {
    const tokens = walletBalance?.tokens;
    if (!tokens || tokens.length === 0) return [];
    return tokens.map((token) => {
      const ch = token.change24h ?? 0;
      return {
        symbol: token.symbol,
        avatarUrl: token.logoUrl,
        change: `${Math.abs(ch).toFixed(1)}%`,
        changePositive: ch >= 0,
        price: token.valueUsd != null
          ? `${token.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`
          : '—',
        onBuy: handleComingSoon,
        onSell: handleComingSoon,
      };
    });
  }, [walletBalance?.tokens, handleComingSoon]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <StatsCard
            label="24H CHANGE"
            value={balanceLoading ? '...' : change24hStr}
            variant="card"
            valueColor={change24h != null && change24h < 0 ? 'negative' : 'positive'}
            style={{ flex: 1 }}
          />
          <StatsCard
            label="EARNINGS TO DATE"
            value={balanceLoading ? '...' : earningsStr}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
        </View>

        {/* Chart */}
        {snapshotsLoading && chartData.length === 0 ? (
          <View style={styles.chartLoading}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : (
          <PerformanceChart
            title="PORTFOLIO PERFORMANCE"
            data={chartData}
            timeRange={chartTimeRange}
            onTimeRangeChange={setChartTimeRange}
          />
        )}

        {/* Portfolio Table */}
        <View style={styles.tableSection}>
          {balanceLoading && portfolioRows.length === 0 ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : portfolioRows.length === 0 ? (
            <View style={styles.emptyTokens}>
              <Ionicons name="wallet-outline" size={32} color={COLORS.textTertiary} />
              <Text variant="caption" color="textTertiary">NO TOKENS YET</Text>
            </View>
          ) : (
            <PortfolioTable
              title="PORTFOLIO"
              rows={portfolioRows}
              showSellColumn
              showBuyColumn
            />
          )}
        </View>

        {/* Swap Widget */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: 28,
  },
  tableSection: {
    marginTop: SPACING.xl,
  },
  swapSection: {
    marginTop: 28,
  },
  chartLoading: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTokens: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
});
