import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export interface StepProgressProps {
  /** 1-based current step. */
  step: number;
  /** Total number of steps. */
  total: number;
}

/**
 * Wizard step indicator: a row of segment bars (filled up to the current step)
 * with a "STEP n / total" caption. Pure presentational — used in the launch
 * Stack header.
 */
export function StepProgress({ step, total }: StepProgressProps) {
  const clamped = Math.min(Math.max(step, 1), total);
  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.segment, i < clamped ? styles.segmentOn : styles.segmentOff]}
          />
        ))}
      </View>
      <Text variant="label" style={styles.caption}>
        {`STEP ${clamped} / ${total}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  bars: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: RADII.full,
  },
  segmentOn: {
    backgroundColor: COLORS.primary,
  },
  segmentOff: {
    backgroundColor: COLORS.border,
  },
  caption: {
    color: COLORS.textTertiary,
    letterSpacing: 2,
  },
});
