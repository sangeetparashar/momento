import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonText } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export function PostDetailSkeleton() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  return (
    <View style={styles.container}>
      {/* Image placeholder */}
      <Skeleton width={SCREEN_WIDTH} height={300} borderRadius={0} />

      {/* Creator row */}
      <View style={styles.creatorRow}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.creatorText}>
          <SkeletonText width={120} />
          <SkeletonText width={60} style={{ marginBottom: 0 }} />
        </View>
      </View>

      {/* Caption lines */}
      <View style={styles.captionSection}>
        <SkeletonText width="95%" />
        <SkeletonText width="70%" />
      </View>

      {/* Comments */}
      <View style={styles.commentsSection}>
        <SkeletonText width={80} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.commentRow}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <View style={styles.commentText}>
              <SkeletonText width={100} />
              <SkeletonText width="80%" style={{ marginBottom: 0 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  creatorText: {
    flex: 1,
    justifyContent: 'center',
  },
  captionSection: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  commentsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  commentText: {
    flex: 1,
    justifyContent: 'center',
  },
});
