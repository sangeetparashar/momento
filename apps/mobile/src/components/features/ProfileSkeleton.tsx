import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

function TokenRowSkeleton() {
  return (
    <View style={styles.tokenRow}>
      <Skeleton width={32} height={32} borderRadius={16} />
      <View style={styles.tokenText}>
        <SkeletonText width={60} />
        <SkeletonText width={40} style={{ marginBottom: 0 }} />
      </View>
      <View style={{ flex: 1 }} />
      <SkeletonText width={50} style={{ marginBottom: 0 }} />
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={styles.container}>
      {/* Header: display name + settings icon */}
      <View style={styles.header}>
        <Skeleton width={180} height={28} borderRadius={RADII.sm} />
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>

      {/* Wallet button */}
      <View style={styles.walletButton}>
        <Skeleton
          width="100%"
          height={48}
          borderRadius={RADII.lg}
        />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <SkeletonText width={80} />
          <Skeleton width={60} height={24} borderRadius={RADII.xs} />
        </View>
        <View style={styles.statCard}>
          <SkeletonText width={80} />
          <Skeleton width={60} height={24} borderRadius={RADII.xs} />
        </View>
      </View>

      {/* Chart placeholder */}
      <View style={styles.chartContainer}>
        <Skeleton
          width="100%"
          height={180}
          borderRadius={RADII.lg}
        />
      </View>

      {/* Portfolio header */}
      <View style={styles.portfolioHeader}>
        <SkeletonText width={80} style={{ marginBottom: 0 }} />
        <SkeletonText width={60} style={{ marginBottom: 0 }} />
      </View>

      {/* Token list rows */}
      <View style={styles.tokenList}>
        {[0, 1, 2, 3].map((i) => (
          <TokenRowSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  walletButton: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
  },
  chartContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
  },
  tokenList: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    marginHorizontal: SPACING.md,
    overflow: 'hidden',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tokenText: {
    justifyContent: 'center',
  },
});
