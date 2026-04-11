import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text, PillButton } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD, FONT_FAMILY_DISPLAY } from '@/styles/typography';

interface TokenInfo {
  /** Token symbol. e.g. "SOL", "USDC". */
  symbol: string;
  /** Optional icon URL. */
  iconUrl?: string;
}

interface TokenSwapWidgetProps {
  /** Called when the pay token "Select Token" pill is pressed. */
  onSelectPayToken: () => void;
  /** Called when the receive token "Select Token" pill is pressed. */
  onSelectReceiveToken: () => void;
  /** Called when the swap arrow is pressed (swap pay/receive). */
  onSwap?: () => void;
  /** Currently selected pay token. */
  payToken?: TokenInfo;
  /** Currently selected receive token. */
  receiveToken?: TokenInfo;
  /** Section title. Default "WALLET". */
  title?: string;
  /** Style override. */
  style?: ViewStyle;
}

/**
 * Internal sub-component: one gradient card in the swap pair.
 */
function SwapCard({
  label,
  icon,
  token,
  onSelect,
}: {
  label?: string;
  icon?: string;
  token?: TokenInfo;
  onSelect: () => void;
}) {
  return (
    <LinearGradient
      colors={[COLORS.surface, COLORS.surfaceElevated]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.cardLeft}>
        {label && (
          <Text variant="caption" style={styles.cardLabel}>
            {label}
          </Text>
        )}
        {icon && !token && (
          <Text variant="body" style={styles.cardIcon}>
            {icon}
          </Text>
        )}
        {token && (
          <Text variant="body" style={styles.tokenSymbol}>
            {token.symbol}
          </Text>
        )}
      </View>

      <PillButton
        label={token ? 'Change' : 'Select Token'}
        variant="outlined"
        size="sm"
        borderColor={COLORS.textSecondary}
        textColor={COLORS.textPrimary}
        onPress={onSelect}
        style={{ paddingHorizontal: 14 }}
      />
    </LinearGradient>
  );
}

/**
 * Token swap widget with two gradient cards and a circular swap arrow.
 *
 * Top card: "Select Payment" + $ icon + SELECT TOKEN pill.
 * Bottom card: SELECT TOKEN pill.
 * Connected by a circular swap arrow in between.
 *
 * @see docs/design/screens/user-account-2.jpg — bottom WALLET section
 * @see docs/design/screens/creator-account-2.png — same on creator view
 */
export function TokenSwapWidget({
  onSelectPayToken,
  onSelectReceiveToken,
  onSwap,
  payToken,
  receiveToken,
  title = 'WALLET',
  style,
}: TokenSwapWidgetProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Title */}
      <Text variant="label" style={styles.title}>
        {title}
      </Text>

      {/* Pay card */}
      <SwapCard
        label="Select Payment"
        icon="$"
        token={payToken}
        onSelect={onSelectPayToken}
      />

      {/* Swap arrow */}
      <Pressable
        onPress={onSwap}
        style={styles.swapArrow}
        hitSlop={8}
        disabled={!onSwap}
      >
        <Ionicons
          name="swap-vertical"
          size={16}
          color={COLORS.textPrimary}
        />
      </Pressable>

      {/* Receive card */}
      <SwapCard
        token={receiveToken}
        onSelect={onSelectReceiveToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontSize: 12,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.lg,
  },

  // Gradient card
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY_DISPLAY,
    marginBottom: 4,
  },
  cardIcon: {
    fontSize: 28,
    color: COLORS.textSecondary,
  },
  tokenSymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },

  // Swap arrow circle
  swapArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: -4,
    zIndex: 1,
  },
});
