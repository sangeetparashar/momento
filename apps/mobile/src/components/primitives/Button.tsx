import React from 'react';
import {
  Pressable,
  PressableProps,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Text } from './Text';
import { COLORS, SPACING, RADII } from '@/styles/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  /** Button text label. */
  label: string;
  /** Visual variant. Defaults to 'primary'. */
  variant?: ButtonVariant;
  /** Size preset. Defaults to 'md'. */
  size?: ButtonSize;
  /** Show a loading spinner and disable interaction. */
  loading?: boolean;
  /** Left icon element rendered before the label. */
  leftIcon?: React.ReactNode;
  /** Right icon element rendered after the label. */
  rightIcon?: React.ReactNode;
  /** Whether the button spans the full width of its container. */
  fullWidth?: boolean;
}

const SIZE_STYLES: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      borderRadius: RADII.sm,
      minHeight: 32,
    },
    text: { fontSize: 13, fontWeight: '600' },
  },
  md: {
    container: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADII.md,
      minHeight: 44,
    },
    text: { fontSize: 15, fontWeight: '600' },
  },
  lg: {
    container: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: RADII.md,
      minHeight: 52,
    },
    text: { fontSize: 17, fontWeight: '700' },
  },
};

const VARIANT_STYLES: Record<
  ButtonVariant,
  {
    container: ViewStyle;
    containerPressed: ViewStyle;
    textColor: string;
    spinnerColor: string;
  }
> = {
  primary: {
    container: { backgroundColor: COLORS.primary },
    containerPressed: { backgroundColor: COLORS.primaryDark },
    textColor: COLORS.textInverse,
    spinnerColor: COLORS.textInverse,
  },
  secondary: {
    container: {
      backgroundColor: COLORS.transparent,
      borderWidth: 1,
      borderColor: COLORS.primary,
    },
    containerPressed: {
      backgroundColor: COLORS.primaryMuted,
      borderWidth: 1,
      borderColor: COLORS.primary,
    },
    textColor: COLORS.primary,
    spinnerColor: COLORS.primary,
  },
  ghost: {
    container: { backgroundColor: COLORS.transparent },
    containerPressed: { backgroundColor: COLORS.backgroundTertiary },
    textColor: COLORS.textPrimary,
    spinnerColor: COLORS.textPrimary,
  },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const sizeStyle = SIZE_STYLES[size];
  const variantStyle = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        sizeStyle.container,
        variantStyle.container,
        pressed && !isDisabled && variantStyle.containerPressed,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyle.spinnerColor}
        />
      ) : (
        <>
          {leftIcon}
          <Text
            variant="body"
            style={[
              sizeStyle.text,
              { color: variantStyle.textColor },
              leftIcon ? { marginLeft: SPACING.xs } : undefined,
              rightIcon ? { marginRight: SPACING.xs } : undefined,
            ]}
          >
            {label}
          </Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});
