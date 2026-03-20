import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export function UserProfileSkeleton() {
  return (
    <View style={styles.container}>
      {/* Avatar centered */}
      <View style={styles.avatarSection}>
        <Skeleton width={80} height={80} borderRadius={40} />
      </View>

      {/* Name + bio */}
      <View style={styles.infoSection}>
        <SkeletonText width={160} />
        <SkeletonText width={220} />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Skeleton width="100%" height={60} borderRadius={RADII.lg} />
      </View>

      {/* Grid placeholders */}
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width="31%" height={110} borderRadius={RADII.xs} style={styles.gridItem} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  infoSection: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  statsRow: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xl,
    gap: 4,
  },
  gridItem: {
    marginBottom: 4,
  },
});
