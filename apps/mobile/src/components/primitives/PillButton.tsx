import React from 'react';
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Text';
import { COLORS, RADII } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

type PillVariant = 'filled' | 'outlined' | 'ghost';
type PillSize = 'xs' | 'sm' | 'md';

interface PillButtonProps {
  /** Button text. Always rendered uppercase. */
  label: string;
  /**
   * Visual variant:
   * - 'filled': Solid background (e.g. SELL pill, white bg)
   * - 'outlined': Transparent bg + border (e.g. BUY pill, SELECT TOKEN)
   * - 'ghost': Subtle bg fill, no explicit border (e.g. active tab in PillTabs)
   */
  variant?: PillVariant;
  /** Size preset. Default 'md'. */
  size?: PillSize;
  /** Background color for filled variant. Default: COLORS.textPrimary (#FFF). */
  fillColor?: string;
  /** Border color for outlined variant. Default: COLORS.textSecondary (#888). */
  borderColor?: string;
  /** Text color override. Defaults based on variant. */
  textColor?: string;
  /** Called on press. */
  onPress?: () => void;
  /** Disables interaction and dims opacity. */
  disabled?: boolean;
  /** Scale factor on press. Default 0.95. */
  scaleValue?: number;
  /** If true, the button stretches to fill available width via flex:1. */
  flex?: boolean;
  /** Accessibility role override. Default 'button'. */
  accessibilityRole?: 'button' | 'tab';
  /** Accessibility selected state (for tabs). */
  accessibilitySelected?: boolean;
  /** Style override for the outer container. */
  style?: ViewStyle;
  /** Style override for the text. */
  textStyle?: TextStyle;
}

const SIZE_MAP: Record<PillSize, { paddingV: number; paddingH: number; fontSize: number; letterSpacing: number }> = {
  xs: { paddingV: 4, paddingH: 10, fontSize: 9, letterSpacing: 1 },
  sm: { paddingV: 6, paddingH: 12, fontSize: 10, letterSpacing: 1 },
  md: { paddingV: 8, paddingH: 12, fontSize: 11, letterSpacing: 1.2 },
};

export function PillButton({
  label,
  variant = 'outlined',
  size = 'md',
  fillColor,
  borderColor,
  textColor,
  onPress,
  disabled = false,
  scaleValue = 0.95,
  flex = false,
  accessibilityRole = 'button',
  accessibilitySelected,
  style,
  textStyle,
}: PillButtonProps) {
  const sizeConfig = SIZE_MAP[size];

  // Resolve colors per variant
  const resolvedFill = fillColor ?? (variant === 'filled' ? COLORS.textPrimary : 'transparent');
  const resolvedBorder = borderColor ?? (variant === 'outlined' ? COLORS.textSecondary : 'transparent');
  const resolvedText =
    textColor ??
    (variant === 'filled'
      ? COLORS.textInverse
      : variant === 'ghost'
        ? COLORS.textSecondary
        : COLORS.textPrimary);

  const containerStyle: ViewStyle = {
    backgroundColor: resolvedFill,
    borderWidth: variant === 'outlined' ? 1 : variant === 'ghost' ? 0 : 0,
    borderColor: resolvedBorder,
    borderRadius: RADII.full,
    paddingVertical: sizeConfig.paddingV,
    paddingHorizontal: sizeConfig.paddingH,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };

  if (flex) {
    containerStyle.flex = 1;
  }

  const labelStyle: TextStyle = {
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    fontSize: sizeConfig.fontSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: sizeConfig.letterSpacing,
    color: resolvedText,
  };

  return (
    <AnimatedPressable
      scaleValue={scaleValue}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={
        accessibilitySelected !== undefined
          ? { selected: accessibilitySelected }
          : undefined
      }
      style={[containerStyle, style]}
    >
      <Text variant="label" style={[labelStyle, textStyle]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}
