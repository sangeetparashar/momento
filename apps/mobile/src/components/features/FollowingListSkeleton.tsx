import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { SPACING } from '@/styles/theme';

export function FollowingListSkeleton() {
  return (
    <View style={styles.container}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={styles.textSection}>
            <SkeletonText width={120} />
            <SkeletonText width={80} style={{ marginBottom: 0 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  textSection: {
    flex: 1,
    justifyContent: 'center',
  },
});
