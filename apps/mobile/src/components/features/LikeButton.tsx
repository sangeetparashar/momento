import React, { useState, useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
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

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.4, { damping: 4, stiffness: 300 }),
      withSpring(1, { damping: 6, stiffness: 200 })
    );

    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev) => prev + (newLiked ? 1 : -1));
    likeMutation.mutate({ postId, liked: newLiked });
  }, [isLiked, postId, likeMutation, scale]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      style={[styles.container, animatedStyle]}
      hitSlop={8}
    >
      <Ionicons
        name={isLiked ? 'heart' : 'heart-outline'}
        size={size}
        color={isLiked ? COLORS.error : COLORS.textSecondary}
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
