import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export interface PercentSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  valueColor?: string;
  onChange: (v: number) => void;
}

/**
 * Percent control rendered as a −/+ STEPPER (no slider lib is installed; the API
 * matches a slider so a native slider can be dropped in later with no caller
 * changes). Clamps to [min, max] and snaps to `step`.
 */
export function PercentSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = '%',
  valueColor = COLORS.primary,
  onChange,
}: PercentSliderProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  const atMin = value <= min;
  const atMax = value >= max;
  const fillPct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
        <Text variant="mono" style={[styles.value, { color: valueColor }]}>
          {value}
          {suffix}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={dec}
          disabled={atMin}
          style={[styles.stepBtn, atMin && styles.stepBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          hitSlop={8}
        >
          <Ionicons
            name="remove"
            size={18}
            color={atMin ? COLORS.textTertiary : COLORS.textPrimary}
          />
        </Pressable>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fillPct}%` }]} />
        </View>

        <Pressable
          onPress={inc}
          disabled={atMax}
          style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          hitSlop={8}
        >
          <Ionicons
            name="add"
            size={18}
            color={atMax ? COLORS.textTertiary : COLORS.textPrimary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    color: COLORS.textSecondary,
  },
  value: {
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary,
  },
});
