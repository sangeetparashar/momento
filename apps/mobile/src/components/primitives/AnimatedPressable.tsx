import React, { useCallback, useRef } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, Animated } from 'react-native';

interface AnimatedPressableProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Scale factor on press (default 0.97). Use lower values for more pronounced effect. */
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A drop-in replacement for Pressable with a subtle scale-down on press.
 *
 * Structure: Pressable (outside, handles touch for full area)
 *            └─ Animated.View (inside, handles visual style + scale animation)
 *               └─ children
 *
 * This ensures the entire styled area is tappable, not just the text content.
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
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
