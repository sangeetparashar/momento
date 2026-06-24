import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

export interface LaunchTokenCtaProps {
  onPress: () => void;
}

/**
 * Entry card on the creator's profile dashboard prompting them to launch their
 * token. Shown only when the creator has no token yet (gated by the parent).
 */
export function LaunchTokenCta({ onPress }: LaunchTokenCtaProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Launch your token"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="sparkles" size={20} color={COLORS.primary} />
      </View>
      <View style={styles.body}>
        <Text variant="h3" style={styles.title}>
          LAUNCH YOUR TOKEN
        </Text>
        <Text variant="caption" style={styles.subtitle}>
          Create your creator coin and open it to trading.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADII.md,
    padding: SPACING.lg,
  },
  pressed: {
    backgroundColor: COLORS.surfaceElevated,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADII.full,
    backgroundColor: COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: SPACING.xxs,
  },
  title: {
    color: COLORS.textPrimary,
  },
  subtitle: {
    color: COLORS.textSecondary,
  },
});
