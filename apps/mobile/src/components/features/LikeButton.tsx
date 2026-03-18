import React, { useState, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';
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

export function LikeButton({
  postId,
  initialLiked = false,
  initialCount = 0,
  size = 24,
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialCount);
  const likeMutation = useLike();

  const scale = useRef(new Animated.Value(1)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    const newLiked = !isLiked;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Scale: pop up to 1.3 then spring back to 1.0
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.3,
        damping: 6,
        stiffness: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 8,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Rotation wobble: swing +5 -> -5 -> 0
    Animated.sequence([
      Animated.timing(rotation, {
        toValue: 5,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: -5,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(rotation, {
        toValue: 0,
        damping: 10,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setIsLiked(newLiked);
    setLikeCount((prev) => prev + (newLiked ? 1 : -1));
    likeMutation.mutate({ postId, liked: newLiked });
  }, [isLiked, postId, likeMutation, scale, rotation]);

  const rotateInterpolation = rotation.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-10deg', '10deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { scale },
            { rotate: rotateInterpolation },
          ],
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        hitSlop={8}
        style={styles.pressable}
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={size}
          color={isLiked ? COLORS.error : COLORS.textSecondary}
        />
        {likeCount > 0 && (
          <Text style={styles.count}>{formatNumber(likeCount)}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressable: {
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
