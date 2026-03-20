import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/primitives';
import { SPACING, RADII } from '@/styles/theme';

export function ChartSkeleton() {
  return (
    <View style={styles.container}>
      {/* Chart area */}
      <Skeleton width="100%" height={180} borderRadius={RADII.lg} />

      {/* Time range tabs */}
      <View style={styles.tabsRow}>
        {['1D', '1W', '1M', '3M', 'ALL'].map((label) => (
          <Skeleton key={label} width={44} height={28} borderRadius={RADII.sm} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
  },
});
