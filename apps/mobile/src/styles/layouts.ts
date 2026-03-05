import { ViewStyle } from 'react-native';
import { COLORS, SPACING, RADII } from './theme';

export const LAYOUTS = {
  /** Horizontal row with centered items. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,

  /** Horizontal row with items spread to edges. */
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,

  /** Centered both horizontally and vertically. */
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,

  /** Full-screen container with dark background and safe padding. */
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  } as ViewStyle,

  /** Standard card surface. */
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  } as ViewStyle,

  /** Absolute fill — covers entire parent. */
  absoluteFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  } as ViewStyle,
} as const;

export type LayoutName = keyof typeof LAYOUTS;
