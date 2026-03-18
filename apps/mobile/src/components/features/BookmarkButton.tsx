import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Pressable, StyleSheet, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/services/api';
import { COLORS, SPACING } from '@/styles/theme';

interface BookmarkButtonProps {
  postId: string;
  initialSaved?: boolean;
  size?: number;
}

export function BookmarkButton({
  postId,
  initialSaved = false,
  size = 22,
}: BookmarkButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved);

  useEffect(() => {
    setIsSaved(initialSaved);
  }, [initialSaved]);

  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    const newSaved = !isSaved;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Scale pop animation
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

    // Optimistic update
    setIsSaved(newSaved);

    apiService
      .post<{ saved: boolean }>('/users/me/saved', { postId })
      .then((res) => {
        // Sync with server truth
        setIsSaved(res.saved);
      })
      .catch(() => {
        // Revert on error
        setIsSaved(!newSaved);
      });
  }, [isSaved, postId, scale]);

  return (
    <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
      <Pressable onPress={handlePress} hitSlop={8} style={styles.pressable}>
        <Ionicons
          name={isSaved ? 'bookmark' : 'bookmark-outline'}
          size={size}
          color={isSaved ? COLORS.primary : COLORS.textSecondary}
        />
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
    padding: SPACING.xs,
  },
});
