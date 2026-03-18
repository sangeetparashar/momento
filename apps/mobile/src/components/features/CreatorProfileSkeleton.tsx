import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export function CreatorProfileSkeleton() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.container}>
      {/* Banner */}
      <Skeleton width={width} height={180} borderRadius={0} />

      {/* Avatar + name */}
      <View style={styles.profileSection}>
        <Skeleton width={80} height={80} borderRadius={40} />
        <View style={styles.nameSection}>
          <SkeletonText width={140} />
          <SkeletonText width={80} />
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Skeleton width={60} height={40} borderRadius={RADII.sm} />
        <Skeleton width={60} height={40} borderRadius={RADII.sm} />
        <Skeleton width={60} height={40} borderRadius={RADII.sm} />
      </View>

      {/* Bio */}
      <View style={styles.bioSection}>
        <SkeletonText width="90%" />
        <SkeletonText width="70%" />
      </View>

      {/* Post grid */}
      <View style={styles.gridRow}>
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            width={(width - SPACING.md * 2 - SPACING.xs * 2) / 3}
            height={(width - SPACING.md * 2 - SPACING.xs * 2) / 3}
            borderRadius={RADII.xs}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  nameSection: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  bioSection: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
});
