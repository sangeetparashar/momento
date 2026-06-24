import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { PercentSlider } from '@/components/composites';
import { COLORS, SPACING, RADII } from '@/styles/theme';

/** The four post-graduation LP allocation buckets (must total 100). */
export interface AllocationValue {
  partnerLockedLpPct: number;
  partnerLpPct: number;
  creatorLockedLpPct: number;
  creatorLpPct: number;
}

export interface AllocationSlidersProps {
  value: AllocationValue;
  onChange: (v: AllocationValue) => void;
}

const DEFAULT_ALLOCATION: AllocationValue = {
  partnerLockedLpPct: 50,
  partnerLpPct: 0,
  creatorLockedLpPct: 50,
  creatorLpPct: 0,
};

const FIELDS: { key: keyof AllocationValue; label: string }[] = [
  { key: 'creatorLockedLpPct', label: 'CREATOR LOCKED LP' },
  { key: 'creatorLpPct', label: 'CREATOR LP' },
  { key: 'partnerLockedLpPct', label: 'PARTNER LOCKED LP' },
  { key: 'partnerLpPct', label: 'PARTNER LP' },
];

/**
 * Four stepper controls for the post-graduation LP distribution, a live total
 * bar, and a RESET button. Total must equal 100% — the bar turns green when
 * valid and red otherwise. Validation itself lives in the wizard; this surfaces
 * the running total so the user can fix it before Next.
 */
export function AllocationSliders({ value, onChange }: AllocationSlidersProps) {
  const total =
    value.partnerLockedLpPct +
    value.partnerLpPct +
    value.creatorLockedLpPct +
    value.creatorLpPct;
  const valid = total === 100;

  const set = (key: keyof AllocationValue, v: number) =>
    onChange({ ...value, [key]: v });

  return (
    <View>
      {FIELDS.map((f) => (
        <PercentSlider
          key={f.key}
          label={f.label}
          value={value[f.key]}
          min={0}
          max={100}
          step={5}
          onChange={(v) => set(f.key, v)}
        />
      ))}

      <View style={styles.totalRow}>
        <View
          style={[
            styles.totalChip,
            { borderColor: valid ? COLORS.primary : COLORS.error },
          ]}
        >
          <Text
            variant="mono"
            style={[styles.totalValue, { color: valid ? COLORS.primary : COLORS.error }]}
          >
            {`TOTAL ${total}%`}
          </Text>
          {valid ? (
            <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
          ) : (
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          )}
        </View>

        <Pressable
          onPress={() => onChange(DEFAULT_ALLOCATION)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reset allocation"
          style={styles.resetBtn}
        >
          <Ionicons name="refresh" size={14} color={COLORS.textSecondary} />
          <Text variant="label" style={styles.resetText}>
            RESET
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  totalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  totalValue: {
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  resetText: {
    color: COLORS.textSecondary,
  },
});
