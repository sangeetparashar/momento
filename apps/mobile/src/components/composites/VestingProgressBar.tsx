import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADII } from '@/styles/theme';

export interface VestingProgressBarProps {
  totalBase: string;
  withdrawnBase: string;
  claimableBase: string;
  /** Bar height in px. Default 8. */
  height?: number;
  style?: ViewStyle;
}

/**
 * Three-segment vesting bar over the LOCKED track:
 *  - withdrawn: solid green
 *  - claimable: 50%-alpha green (claimable-now, not yet withdrawn)
 *  - remainder: locked track (border color)
 *
 * Widths derived with BigInt to avoid float drift on base units; clamped so the
 * two filled segments never exceed 100% combined.
 */
export function VestingProgressBar({
  totalBase,
  withdrawnBase,
  claimableBase,
  height = 8,
  style,
}: VestingProgressBarProps) {
  let withdrawnPct = 0;
  let claimablePct = 0;

  try {
    const total = BigInt(totalBase || '0');
    if (total > 0n) {
      const withdrawn = BigInt(withdrawnBase || '0');
      const claimable = BigInt(claimableBase || '0');
      withdrawnPct = Number((withdrawn * 10000n) / total) / 100;
      claimablePct = Number((claimable * 10000n) / total) / 100;
    }
  } catch {
    withdrawnPct = 0;
    claimablePct = 0;
  }

  withdrawnPct = Math.max(0, Math.min(100, withdrawnPct));
  claimablePct = Math.max(0, Math.min(100 - withdrawnPct, claimablePct));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(withdrawnPct + claimablePct),
      }}
    >
      {withdrawnPct > 0 && (
        <View
          style={[
            styles.segment,
            { width: `${withdrawnPct}%`, backgroundColor: COLORS.primary },
          ]}
        />
      )}
      {claimablePct > 0 && (
        <View
          style={[
            styles.segment,
            { width: `${claimablePct}%`, backgroundColor: 'rgba(0,255,136,0.5)' },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    borderRadius: RADII.full,
  },
  segment: {
    height: '100%',
  },
});
