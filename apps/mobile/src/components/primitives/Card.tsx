import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADII, SHADOWS } from '@/styles/theme';

type CardVariant = 'flat' | 'elevated';

interface CardProps extends ViewProps {
  /** Visual variant. 'flat' has a border, 'elevated' has a shadow. Defaults to 'flat'. */
  variant?: CardVariant;
  /** Children nodes. */
  children: React.ReactNode;
}

export function Card({
  variant = 'flat',
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'flat' ? styles.flat : styles.elevated,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.lg,
  },
  flat: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  elevated: {
    ...SHADOWS.md,
    borderWidth: 0,
  },
});
