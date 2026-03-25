import React, { useEffect } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../primitives/Text';
import { useCoachMark } from '@/hooks/useCoachMark';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Translucent overlay with an animated hand icon swiping left.
 * Shows on first home feed visit, dismisses on tap or when parent calls onDismiss.
 */
export function SwipeIndicator({ onDismiss }: { onDismiss?: () => void }) {
  const { visible, dismiss } = useCoachMark('home_swipe');
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    // Animate hand icon: slide left 40px and back, repeating
    translateX.value = withRepeat(
      withSequence(
        withDelay(
          300,
          withTiming(-40, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, // infinite
      false,
    );
  }, [visible, translateX]);

  if (!visible) return null;

  const handleDismiss = () => {
    dismiss();
    onDismiss?.();
  };

  const handStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(250)}
      onPress={handleDismiss}
      style={styles.overlay}
    >
      <Animated.View style={[styles.content, handStyle]}>
        <Ionicons name="hand-left-outline" size={36} color={COLORS.textPrimary} />
      </Animated.View>
      <Text style={styles.label}>Swipe to browse</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 50,
  },
  content: {
    marginBottom: SPACING.md,
  },
  label: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    overflow: 'hidden',
  },
});
