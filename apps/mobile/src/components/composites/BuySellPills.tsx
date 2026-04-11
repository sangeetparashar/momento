import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { PillButton } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';

interface BuySellPillsProps {
  /** Called when BUY is pressed. */
  onBuy: () => void;
  /** Called when SELL is pressed. */
  onSell: () => void;
  /** Disables both buttons. */
  disabled?: boolean;
  /** Custom BUY label. Default "BUY". */
  buyLabel?: string;
  /** Custom SELL label. Default "SELL". */
  sellLabel?: string;
  /**
   * Layout direction:
   * - 'row' (default): side-by-side.
   * - 'stack': vertical (for narrow containers).
   */
  layout?: 'row' | 'stack';
  /** Style override for the outer container. */
  style?: ViewStyle;
}

/**
 * Paired BUY (outlined) + SELL (filled) pill buttons.
 *
 * BUY: transparent bg, gray border (#888), white text.
 * SELL: white bg, white border, black text.
 * Both use full-radius pill shape and uppercase Space Mono Bold.
 *
 * @see docs/design/screens/creator-token.png — below $DEEL symbol
 */
export function BuySellPills({
  onBuy,
  onSell,
  disabled = false,
  buyLabel = 'BUY',
  sellLabel = 'SELL',
  layout = 'row',
  style,
}: BuySellPillsProps) {
  return (
    <View
      style={[
        styles.container,
        layout === 'stack' && styles.containerStack,
        style,
      ]}
    >
      <PillButton
        label={buyLabel}
        variant="outlined"
        size="md"
        borderColor={COLORS.textSecondary}
        textColor={COLORS.textPrimary}
        onPress={onBuy}
        disabled={disabled}
        style={styles.pill}
        textStyle={styles.pillText}
      />
      <PillButton
        label={sellLabel}
        variant="filled"
        size="md"
        fillColor={COLORS.textPrimary}
        textColor={COLORS.textInverse}
        onPress={onSell}
        disabled={disabled}
        style={styles.pill}
        textStyle={styles.pillText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  containerStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  pill: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 36,
  },
  pillText: {
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
