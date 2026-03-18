import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Skeleton } from '@/components/primitives';
import { SPACING, RADII } from '@/styles/theme';

const COLUMN_GAP = SPACING.xs;

export function ExploreSkeleton() {
  const { width } = useWindowDimensions();
  const itemWidth = (width - SPACING.md * 2 - COLUMN_GAP) / 2;

  const items = [1.3, 1.0, 1.0, 1.3, 1.3, 1.0];

  return (
    <View style={styles.container}>
      <View style={styles.column}>
        {items
          .filter((_, i) => i % 2 === 0)
          .map((h, i) => (
            <Skeleton
              key={i}
              width={itemWidth}
              height={itemWidth * h}
              borderRadius={RADII.md}
            />
          ))}
      </View>
      <View style={styles.column}>
        {items
          .filter((_, i) => i % 2 === 1)
          .map((h, i) => (
            <Skeleton
              key={i}
              width={itemWidth}
              height={itemWidth * h}
              borderRadius={RADII.md}
            />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: COLUMN_GAP,
  },
  column: {
    flex: 1,
    gap: COLUMN_GAP,
  },
});
