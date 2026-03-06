import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADII } from '@/styles/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = RADII.sm,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.surfaceElevated,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

interface SkeletonTextProps {
  width?: number | string;
  style?: ViewStyle;
}

export function SkeletonText({ width = '100%', style }: SkeletonTextProps) {
  return (
    <Skeleton
      width={width}
      height={14}
      borderRadius={RADII.xs}
      style={[{ marginBottom: 8 }, style] as ViewStyle}
    />
  );
}
