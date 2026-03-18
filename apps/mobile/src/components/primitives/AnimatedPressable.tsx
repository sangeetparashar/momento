import React, { useCallback, useRef } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, Animated } from 'react-native';

interface AnimatedPressableProps extends PressableProps {
  /** Scale factor on press (default 0.97). Use lower values for more pronounced effect. */
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A drop-in replacement for Pressable with a subtle scale-down on press.
 * Uses React Native Animated for smooth spring-based animations.
 */
export function AnimatedPressable({
  scaleValue = 0.97,
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (event: any) => {
      Animated.timing(scale, {
        toValue: scaleValue,
        duration: 100,
        useNativeDriver: true,
      }).start();
      onPressIn?.(event);
    },
    [scaleValue, onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: any) => {
      Animated.spring(scale, {
        toValue: 1,
        damping: 15,
        stiffness: 150,
        useNativeDriver: true,
      }).start();
      onPressOut?.(event);
    },
    [onPressOut, scale]
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
