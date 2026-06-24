import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

/**
 * Loading placeholder for the token DETAIL / TRADE screens. Mirrors the layout
 * of the loaded view (symbol hero → BUY/SELL pills → 3-up stat row → fundraise
 * bar → chart) so the swap-in is visually stable. Design-system surfaces only.
 *
 * @see docs/design/screens/creator-token.png
 */
export function TradeScreenSkeleton() {
  return (
    <View style={styles.container}>
      {/* Symbol hero */}
      <Skeleton width={160} height={36} borderRadius={RADII.sm} style={styles.center} />

      {/* BUY / SELL pills */}
      <View style={styles.pillRow}>
        <Skeleton width={120} height={44} borderRadius={RADII.full} />
        <Skeleton width={120} height={44} borderRadius={RADII.full} />
      </View>

      {/* 3-up stat row */}
      <View style={styles.statRow}>
        <Skeleton height={64} borderRadius={RADII.md} style={styles.statCell} />
        <Skeleton height={64} borderRadius={RADII.md} style={styles.statCell} />
        <Skeleton height={64} borderRadius={RADII.md} style={styles.statCell} />
      </View>

      {/* Fundraise bar */}
      <Skeleton height={48} borderRadius={RADII.md} style={styles.block} />

      {/* Chart */}
      <Skeleton height={180} borderRadius={RADII.md} style={styles.block} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl * 2,
    gap: SPACING.xl,
  },
  center: {
    alignSelf: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  statRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statCell: {
    flex: 1,
  },
  block: {
    width: '100%',
  },
});
