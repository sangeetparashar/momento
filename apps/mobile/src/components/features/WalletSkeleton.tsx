import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export function WalletSkeleton() {
  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <SkeletonText width={80} />
        <Skeleton width={160} height={36} borderRadius={RADII.sm} />
        <SkeletonText width={100} style={{ marginTop: SPACING.sm }} />
      </View>

      {/* Action buttons row */}
      <View style={styles.actionsRow}>
        <Skeleton width="48%" height={44} borderRadius={RADII.full} />
        <Skeleton width="48%" height={44} borderRadius={RADII.full} />
      </View>

      {/* Token list */}
      <View style={styles.tokenList}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.tokenRow}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <View style={styles.tokenText}>
              <SkeletonText width={80} />
              <SkeletonText width={50} style={{ marginBottom: 0 }} />
            </View>
            <View style={{ flex: 1 }} />
            <SkeletonText width={60} style={{ marginBottom: 0 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.md,
  },
  balanceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  tokenList: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  tokenText: {
    justifyContent: 'center',
  },
});
