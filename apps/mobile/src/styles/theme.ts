/**
 * Momento dark-first design tokens.
 */

export const COLORS = {
  // Brand
  primary: '#00FF88',
  primaryDark: '#00CC6A',
  primaryLight: '#33FF9F',
  primaryMuted: 'rgba(0, 255, 136, 0.15)',

  // Backgrounds
  background: '#0D0D0D',
  backgroundSecondary: '#1A1A1A',
  backgroundTertiary: '#242424',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#8A8A8A',
  textTertiary: '#555555',
  textInverse: '#0D0D0D',

  // Semantic
  success: '#00FF88',
  error: '#FF4444',
  warning: '#FFB800',
  info: '#4488FF',

  // Utility
  border: '#2A2A2A',
  borderLight: '#333333',
  divider: '#1F1F1F',
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',

  // Market specific
  marketGreen: '#00FF88',
  marketRed: '#FF4444',

  // Social
  youtube: '#FF0000',
  instagram: '#E4405F',
  twitter: '#1DA1F2',
  spotify: '#1DB954',
  tiktok: '#000000',
} as const;

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADII = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: {
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export type ColorName = keyof typeof COLORS;
export type SpacingName = keyof typeof SPACING;
export type RadiusName = keyof typeof RADII;
export type ShadowName = keyof typeof SHADOWS;
