import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';

export interface ReviewRowProps {
  label: string;
  value: string;
  /** When provided, renders an "EDIT" affordance that jumps back to the step. */
  onEdit?: () => void;
}

/**
 * A single label / value line in the review step. Optional EDIT button on the
 * right navigates back to the owning wizard step.
 */
export function ReviewRow({ label, value, onEdit }: ReviewRowProps) {
  return (
    <View style={styles.row}>
      <Text variant="label" style={styles.label}>
        {label}
      </Text>
      <View style={styles.right}>
        <Text variant="mono" style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${label}`}
            style={styles.editBtn}
          >
            <Ionicons name="create-outline" size={16} color={COLORS.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  label: {
    color: COLORS.textSecondary,
    flexShrink: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  value: {
    color: COLORS.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  editBtn: {
    flexShrink: 0,
  },
});
