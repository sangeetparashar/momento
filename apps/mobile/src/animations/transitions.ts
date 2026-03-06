import { Easing } from 'react-native-reanimated';
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

/**
 * Reusable animation configurations for the Momento app.
 *
 * Recommended entering animations (use directly in components):
 *
 *   List items:      FadeInDown.duration(350).springify().damping(18)
 *   Modals:          SlideInDown.duration(400).springify().damping(20)
 *   Cards:           FadeIn.duration(300)
 *   Staggered lists: FadeInDown.delay(index * 50).duration(300)
 *   Screen entrances: FadeIn.duration(600)
 */

/** Spring config for bouncy interactions (buttons, cards) */
export const SPRING_BOUNCE: WithSpringConfig = {
  damping: 12,
  stiffness: 180,
  mass: 0.8,
};

/** Spring config for smooth settling (modals, sheets) */
export const SPRING_SMOOTH: WithSpringConfig = {
  damping: 20,
  stiffness: 120,
  mass: 1,
};

/** Spring config for the AnimatedPressable press-out recovery */
export const SPRING_PRESSABLE: WithSpringConfig = {
  damping: 15,
  stiffness: 150,
};

/** Timing config for fast micro-interactions (100-200ms) */
export const TIMING_FAST: WithTimingConfig = {
  duration: 150,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

/** Timing config for medium transitions (250-350ms) */
export const TIMING_MEDIUM: WithTimingConfig = {
  duration: 300,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};

/** Timing config for press-in scale (snappy) */
export const TIMING_PRESS_IN: WithTimingConfig = {
  duration: 100,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
};
