import React, { useState, useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useLike } from '@/hooks';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatNumber } from '@/utils/formatters';

interface LikeButtonProps {
  postId: string;
  initialLiked?: boolean;
  initialCount?: number;
  size?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

export function LikeButton({
  postId,
  initialLiked = false,
  initialCount = 0,
  size = 24,
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialCount);
  const likeMutation = useLike();

  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const colorFlash = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotateZ: `${rotation.value}deg` },
    ],
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorFlash.value,
      [0, 1],
      [COLORS.error, COLORS.primary]
    ),
  }));

  const handlePress = useCallback(() => {
    const newLiked = !isLiked;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Scale: pop up to 1.3 then spring back to 1.0
    scale.value = withSequence(
      withSpring(1.3, { damping: 6, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 })
    );

    // Rotation wobble: swing +5 -> -5 -> 0
    rotation.value = withSequence(
      withTiming(5, { duration: 80 }),
      withTiming(-5, { duration: 80 }),
      withSpring(0, { damping: 10, stiffness: 200 })
    );

    // Flash green briefly on like
    if (newLiked) {
      colorFlash.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
    }

    setIsLiked(newLiked);
    setLikeCount((prev) => prev + (newLiked ? 1 : -1));
    likeMutation.mutate({ postId, liked: newLiked });
  }, [isLiked, postId, likeMutation, scale, rotation, colorFlash]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[styles.container, animatedStyle]}
      hitSlop={8}
    >
      <AnimatedIonicons
        name={isLiked ? 'heart' : 'heart-outline'}
        size={size}
        color={isLiked ? COLORS.error : COLORS.textSecondary}
        style={isLiked ? animatedIconStyle : undefined}
      />
      {likeCount > 0 && (
        <Text style={styles.count}>{formatNumber(likeCount)}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  count: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
