import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export interface VestingSkeletonProps {
  /** Number of placeholder cards to render. Default 3. */
  count?: number;
}

/**
 * Loading placeholder for the vesting list. Mirrors the layout of
 * `VestingScheduleCard` (header row, progress bar, three stat columns, CTA) so
 * the transition to real data is visually stable. Reuses the shared `Skeleton`
 * primitive (the app-wide shimmer).
 */
export function VestingSkeleton({ count = 3 }: VestingSkeletonProps) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          {/* header: symbol + status pill */}
          <View style={styles.headerRow}>
            <Skeleton width={88} height={18} borderRadius={RADII.xs} />
            <Skeleton width={64} height={20} borderRadius={RADII.full} />
          </View>

          {/* cliff / kind line */}
          <Skeleton width="60%" height={12} borderRadius={RADII.xs} style={styles.line} />

          {/* progress bar */}
          <Skeleton width="100%" height={8} borderRadius={RADII.full} style={styles.bar} />

          {/* three stat columns */}
          <View style={styles.statsRow}>
            {Array.from({ length: 3 }).map((__, j) => (
              <View key={j} style={styles.statCol}>
                <Skeleton width={48} height={10} borderRadius={RADII.xs} />
                <Skeleton
                  width={64}
                  height={16}
                  borderRadius={RADII.xs}
                  style={styles.statValue}
                />
              </View>
            ))}
          </View>

          {/* CTA */}
          <Skeleton width="100%" height={44} borderRadius={RADII.md} style={styles.cta} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  line: {
    marginTop: SPACING.md,
  },
  bar: {
    marginTop: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  statCol: {
    flex: 1,
    gap: SPACING.sm,
  },
  statValue: {
    marginTop: SPACING.xxs,
  },
  cta: {
    marginTop: SPACING.lg,
  },
});
