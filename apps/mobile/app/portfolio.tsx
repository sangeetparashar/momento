import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
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
import { COLORS, SPACING } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

// Sample data until real API exists
const SAMPLE_CHART_DATA = [
  { x: 0, y: 45 }, { x: 1, y: 42 }, { x: 2, y: 50 },
  { x: 3, y: 55 }, { x: 4, y: 52 }, { x: 5, y: 60 },
  { x: 6, y: 75 }, { x: 7, y: 70 }, { x: 8, y: 80 },
  { x: 9, y: 85 }, { x: 10, y: 82 }, { x: 11, y: 95 },
];

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
  const { data: walletBalance } = useWalletBalance();
  const [chartTimeRange, setChartTimeRange] = useState('1Y');
  const [showComingSoon, setShowComingSoon] = useState(false);

  const change24h = (walletBalance as any)?.change24h ?? '0.9%';
  const earnings = (walletBalance as any)?.totalEarnings ?? '12.2K';

  const handleComingSoon = useCallback(() => {
    setShowComingSoon(true);
  }, []);

  const portfolioRows: PortfolioRowProps[] = useMemo(() => [
    { symbol: 'DEEL', avatarColor: '#8B5CF6', change: '17%', changePositive: true, price: '10,631USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'BELLE', avatarColor: '#EC4899', change: '0.5%', changePositive: true, price: '10.67M USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'NAAN', avatarColor: '#F97316', change: '3%', changePositive: false, price: '3,050USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'AURA', avatarColor: '#06B6D4', change: '2%', changePositive: true, price: '17,019USD', onBuy: handleComingSoon, onSell: handleComingSoon },
    { symbol: 'SEAM', avatarColor: '#10B981', change: '267%', changePositive: true, price: '93,780USD', onBuy: handleComingSoon, onSell: handleComingSoon },
  ], [handleComingSoon]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
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
            value={String(change24h)}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
          <StatsCard
            label="EARNINGS TO DATE"
            value={String(earnings)}
            variant="card"
            valueColor="positive"
            style={{ flex: 1 }}
          />
        </View>

        {/* Chart */}
        <PerformanceChart
          title="PORTFOLIO PERFORMANCE"
          data={SAMPLE_CHART_DATA}
          timeRange={chartTimeRange}
          onTimeRangeChange={setChartTimeRange}
        />

        {/* Portfolio Table */}
        <View style={styles.tableSection}>
          <PortfolioTable
            title="PORTFOLIO"
            rows={portfolioRows}
            showSellColumn
            showBuyColumn
          />
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
});
