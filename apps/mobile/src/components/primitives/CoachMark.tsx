import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useCoachMark } from '@/hooks/useCoachMark';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

type Position = 'top' | 'bottom';

interface CoachMarkProps {
  /** Unique persistence key for this hint */
  hintId: string;
  /** Hint message text */
  text: string;
  /** Where the tooltip appears relative to children. Default: 'bottom' */
  position?: Position;
  /** Optional callback after dismiss */
  onDismiss?: () => void;
  /** Optional style for the wrapper View */
  style?: import('react-native').ViewStyle;
  /** The element to anchor the hint to */
  children: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CoachMark({
  hintId,
  text,
  position = 'bottom',
  onDismiss,
  style,
  children,
}: CoachMarkProps) {
  const { visible, dismiss } = useCoachMark(hintId);

  const handleDismiss = () => {
    dismiss();
    onDismiss?.();
  };

  return (
    <View style={[styles.wrapper, style]}>
      {children}
      {visible && (
        <AnimatedPressable
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          onPress={handleDismiss}
          style={[
            styles.tooltip,
            position === 'top' ? styles.tooltipTop : styles.tooltipBottom,
          ]}
        >
          {/* Arrow */}
          <View
            style={[
              styles.arrow,
              position === 'top' ? styles.arrowBottom : styles.arrowTop,
            ]}
          />

          <Text style={styles.text}>{text}</Text>

          <Pressable onPress={handleDismiss} hitSlop={8} style={styles.closeButton}>
            <Ionicons name="close" size={14} color={COLORS.textSecondary} />
          </Pressable>
        </AnimatedPressable>
      )}
    </View>
  );
}

const ARROW_SIZE = 6;

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    zIndex: 100,
  },
  tooltipTop: {
    bottom: '100%',
    marginBottom: ARROW_SIZE + 4,
  },
  tooltipBottom: {
    top: '100%',
    marginTop: ARROW_SIZE + 4,
  },
  arrow: {
    position: 'absolute',
    alignSelf: 'center',
    left: SPACING.xl,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowTop: {
    top: -ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderBottomColor: COLORS.primary,
  },
  arrowBottom: {
    bottom: -ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderTopColor: COLORS.primary,
  },
  text: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    flex: 1,
  },
  closeButton: {
    padding: SPACING.xs,
    marginLeft: SPACING.xs,
  },
});
