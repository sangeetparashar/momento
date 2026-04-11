import { TextStyle, Platform } from 'react-native';
import { COLORS } from './theme';

const FONT_FAMILY_SYSTEM = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

const FONT_FAMILY_MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

// Space Mono loaded via expo-font in _layout.tsx
// Falls back to system mono if not yet loaded
export const FONT_FAMILY_DISPLAY = 'SpaceMono-Regular';
export const FONT_FAMILY_DISPLAY_BOLD = 'SpaceMono-Bold';

export const TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  } as TextStyle,

  h2: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  } as TextStyle,

  h3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  } as TextStyle,

  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    letterSpacing: 0.3,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY,
  } as TextStyle,

  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: 0.2,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY_DISPLAY,
  } as TextStyle,

  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY_DISPLAY,
  } as TextStyle,

  label: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  } as TextStyle,

  mono: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_MONO,
  } as TextStyle,

  monoLarge: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_MONO,
  } as TextStyle,
} as const;

export type TypographyVariant = keyof typeof TYPOGRAPHY;
