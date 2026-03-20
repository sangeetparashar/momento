import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/primitives';
import { SPACING, RADII } from '@/styles/theme';

export function FavoritesSkeleton() {
  return (
    <View style={styles.container}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} width="48%" height={160} borderRadius={RADII.lg} style={styles.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  card: {
    marginBottom: SPACING.sm,
  },
});
