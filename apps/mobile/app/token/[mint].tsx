import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/primitives';
import {
  BuySellPills,
  PerformanceChart,
  TokenStatRow,
  FundraiseProgress,
  FeeDisclosure,
} from '@/components/composites';
import {
  TradeScreenSkeleton,
  RecentTradesList,
} from '@/components/features';
import { useTokenDetail, useTokenTrades } from '@/hooks';
import { ENV } from '@/config/env';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY, FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

/**
 * Public token DETAIL screen (`/token/[mint]`).
 *
 * GET /tokens/[mint] (§d.2) via useTokenDetail. Renders the symbol hero,
 * BUY/SELL pills (→ /token/[mint]/trade?side=…), PRICE/MARKET-CAP stat row,
 * fundraise progress (pre-grad) or graduated badge, price chart (real points
 * only — gated feed empty until backend lands), creator attribution, recent
 * trades, and the fee/tax disclosure. Loading / error / not-tradeable states.
 */
export default function TokenDetailScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const router = useRouter();
  const [chartTimeRange, setChartTimeRange] = useState('1Y');

  const { data: token, isLoading, isError, refetch } = useTokenDetail(mint);
  const tradesQuery = useTokenTrades(mint);

  const isTradeable = token?.status === 'ACTIVE' || !!token?.graduatedAt;

  const goToTrade = useCallback(
    (side: 'buy' | 'sell') => {
      if (mint) router.push(`/token/${mint}/trade?side=${side}`);
    },
    [router, mint],
  );

  const handleBack = useCallback(() => router.back(), [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text variant="label" style={styles.headerTitle}>
          {token ? `$${token.symbol}` : 'TOKEN'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading && !token ? (
        <TradeScreenSkeleton />
      ) : isError || !token ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textTertiary} />
          <Text variant="body" style={styles.emptyText}>
            TOKEN NOT FOUND
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text variant="label" style={styles.retryText}>
              RETRY
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Symbol hero + name */}
          <Text style={styles.hero}>${token.symbol}</Text>
          {!!token.name && (
            <Text variant="caption" style={styles.heroName}>
              {token.name}
            </Text>
          )}

          {/* BUY / SELL */}
          <BuySellPills
            onBuy={() => goToTrade('buy')}
            onSell={() => goToTrade('sell')}
            disabled={!isTradeable}
            buyLabel={isTradeable ? 'BUY' : 'NOT TRADEABLE'}
            style={styles.pills}
          />

          {/* Stats */}
          <View style={styles.statRow}>
            <TokenStatRow
              priceUsd={token.priceUsd}
              marketCapUsd={token.marketCapUsd}
            />
          </View>

          {/* Fundraise progress (pre-grad) or graduated badge */}
          {token.fundraise ? (
            <FundraiseProgress
              raisedBaseUnits={token.fundraise.raisedBaseUnits}
              thresholdBaseUnits={token.fundraise.thresholdBaseUnits}
              progressPct={token.fundraise.progressPct}
              quoteMint={token.fundraise.quoteMint}
              status={token.fundraise.status as any}
              graduatedAt={token.graduatedAt}
              style={styles.section}
            />
          ) : token.graduatedAt ? (
            <View style={[styles.graduatedBadge, styles.section]}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
              <Text variant="label" style={styles.graduatedText}>
                GRADUATED
              </Text>
            </View>
          ) : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Price history (real points only) */}
          <PerformanceChart
            title="TOKEN PERFORMANCE"
            data={[]}
            timeRange={chartTimeRange}
            onTimeRangeChange={setChartTimeRange}
            style={styles.chart}
          />

          {/* Creator */}
          <Pressable
            style={[styles.creatorRow, styles.section]}
            onPress={() => router.push(`/creator/${token.creator.id}`)}
            accessibilityRole="button"
          >
            <Avatar name={token.creator.username ?? undefined} size="sm" />
            <View style={styles.creatorMeta}>
              <View style={styles.creatorNameRow}>
                <Text variant="bodySmall" style={styles.creatorName}>
                  {token.creator.username ?? 'Creator'}
                </Text>
                {token.creator.verified && <View style={styles.verifiedDot} />}
              </View>
              <Text variant="caption" style={styles.creatorLabel}>
                CREATOR
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
          </Pressable>

          {/* Recent trades — only when the feed is enabled; otherwise a "NO
              TRADES YET" empty state is indistinguishable from "feature off"
              and reads as a bug on an actively-traded token. */}
          {ENV.FEES_FEED_ENABLED && (
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                RECENT TRADES
              </Text>
              <RecentTradesList
                trades={tradesQuery.data ?? []}
                decimals={token.decimals}
                symbol={token.symbol}
              />
            </View>
          )}

          {/* Fee disclosure */}
          <FeeDisclosure
            variant="trade"
            display="expandable"
            transferFeeBps={token.transferFeeBps}
            rebateMint={token.feeConfig.rebateMint}
            symbol={token.symbol}
            style={styles.section}
          />
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  hero: {
    ...TYPOGRAPHY.h2,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    fontSize: 36,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroName: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    letterSpacing: 1,
    textTransform: 'none',
  },
  pills: {
    marginTop: SPACING.xl,
  },
  statRow: {
    width: '100%',
    marginTop: SPACING.xl,
  },
  section: {
    width: '100%',
    marginTop: SPACING.xl,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xl,
  },
  chart: {
    width: '100%',
  },
  graduatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADII.full,
  },
  graduatedText: {
    color: COLORS.primary,
    letterSpacing: 1.5,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  creatorMeta: {
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  creatorName: {
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
  creatorLabel: {
    color: COLORS.textTertiary,
    marginTop: 1,
    letterSpacing: 1,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textTertiary,
    letterSpacing: 1,
  },
  retryBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.full,
  },
  retryText: {
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
});
