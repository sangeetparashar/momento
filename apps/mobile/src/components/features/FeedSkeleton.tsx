import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

function PostCardSkeleton() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  return (
    <View style={styles.card}>
      {/* Header row: avatar + text lines */}
      <View style={styles.header}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.headerText}>
          <SkeletonText width={120} />
          <SkeletonText width={60} style={{ marginBottom: 0 }} />
        </View>
      </View>

      {/* Image placeholder */}
      <Skeleton
        width={SCREEN_WIDTH}
        height={SCREEN_WIDTH}
        borderRadius={0}
      />

      {/* Actions row */}
      <View style={styles.actionsRow}>
        <Skeleton width={28} height={28} borderRadius={14} />
        <Skeleton width={28} height={28} borderRadius={14} />
        <View style={{ flex: 1 }} />
        <Skeleton width={28} height={28} borderRadius={14} />
      </View>

      {/* Caption lines */}
      <View style={styles.caption}>
        <SkeletonText width="90%" />
        <SkeletonText width="60%" style={{ marginBottom: 0 }} />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View style={styles.container}>
      {[0, 1, 2].map((i) => (
        <PostCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    backgroundColor: COLORS.background,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  caption: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
});
