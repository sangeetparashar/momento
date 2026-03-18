import { Easing } from 'react-native';

/**
 * Reusable animation configurations for the Momento app.
 *
 * Spring configs are used with Animated.spring().
 * Timing configs are used with Animated.timing().
 */

/** Spring config for bouncy interactions (buttons, cards) */
export const SPRING_BOUNCE = {
  damping: 12,
  stiffness: 180,
  mass: 0.8,
  useNativeDriver: true,
};

/** Spring config for smooth settling (modals, sheets) */
export const SPRING_SMOOTH = {
  damping: 20,
  stiffness: 120,
  mass: 1,
  useNativeDriver: true,
};

/** Spring config for the AnimatedPressable press-out recovery */
export const SPRING_PRESSABLE = {
  damping: 15,
  stiffness: 150,
  useNativeDriver: true,
};

/** Timing config for fast micro-interactions (100-200ms) */
export const TIMING_FAST = {
  duration: 150,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  useNativeDriver: true,
};

/** Timing config for medium transitions (250-350ms) */
export const TIMING_MEDIUM = {
  duration: 300,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  useNativeDriver: true,
};

/** Timing config for press-in scale (snappy) */
export const TIMING_PRESS_IN = {
  duration: 100,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  useNativeDriver: true,
};
