import React, { useCallback, useRef, useMemo } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, Animated, StyleSheet } from 'react-native';

interface AnimatedPressableProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Scale factor on press (default 0.97). Use lower values for more pronounced effect. */
  scaleValue?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

// Properties that affect layout positioning (go on outer Pressable)
const LAYOUT_PROPS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'alignSelf', 'position', 'top', 'bottom', 'left', 'right',
]);

/**
 * A drop-in replacement for Pressable with a subtle scale-down on press.
 *
 * Structure: Pressable (outside — layout props + touch handling)
 *            └─ Animated.View (inside — visual props + scale animation)
 *               └─ children
 *
 * Layout props (flex, width, margin, etc.) go on the Pressable so it
 * participates correctly in parent flex layouts.
 * Visual props (bg, border, padding, radius, opacity) go on the
 * Animated.View so the scale animation applies to the visual pill.
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

  // Split flattened style into layout (Pressable) and visual (Animated.View)
  const { layoutStyle, visualStyle } = useMemo(() => {
    const flat = StyleSheet.flatten(style) || {};
    const layout: Record<string, any> = {};
    const visual: Record<string, any> = {};

    for (const [key, value] of Object.entries(flat)) {
      if (LAYOUT_PROPS.has(key)) {
        layout[key] = value;
      } else {
        visual[key] = value;
      }
    }

    return { layoutStyle: layout, visualStyle: visual };
  }, [style]);

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
      style={layoutStyle}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, visualStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
