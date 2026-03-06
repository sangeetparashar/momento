import React, { useCallback } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  /** Scale factor on press (default 0.97). Use lower values for more pronounced effect. */
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A drop-in replacement for Pressable with a subtle scale-down on press.
 * Uses reanimated for 60fps spring-based animations.
 */
export function AnimatedPressable({
  scaleValue = 0.97,
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (event: any) => {
      scale.value = withTiming(scaleValue, { duration: 100 });
      onPressIn?.(event);
    },
    [scaleValue, onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: any) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      onPressOut?.(event);
    },
    [onPressOut, scale]
  );

  return (
    <AnimatedPressableBase
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}
