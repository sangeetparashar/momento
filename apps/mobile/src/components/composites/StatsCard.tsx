import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

type StatsVariant = 'card' | 'inline';
type ValueColor = 'positive' | 'negative' | 'neutral';

interface StatsCardProps {
  /** Tiny uppercase label above the value. e.g. "24H CHANGE". */
  label: string;
  /** Display value. e.g. "0.9%", "12.2K", "0.004". */
  value: string;
  /**
   * Layout variant:
   * - 'card': Dark surface background box (profile page: 24H CHANGE / EARNINGS).
   * - 'inline': No background, centered text (token page: PRICE / 24H CHANGE / MARKET CAP).
   */
  variant?: StatsVariant;
  /**
   * Value color:
   * - 'positive' (default): Green #00FF88.
   * - 'negative': Red #FF4444.
   * - 'neutral': White #FFFFFF.
   */
  valueColor?: ValueColor;
  /** Optional prefix before the value (e.g. "$", "+"). Rendered in same color. */
  prefix?: string;
  /** Optional suffix after the value (e.g. "USD", "%"). Rendered dimmer. */
  suffix?: string;
  /** Style override for the outer container. */
  style?: ViewStyle;
}

const VALUE_COLORS: Record<ValueColor, string> = {
  positive: COLORS.primary,
  negative: COLORS.error,
  neutral: COLORS.textPrimary,
};

/**
 * Label + value metric display.
 *
 * Two layouts: dark card boxes (profile page) or inline centered text (token page).
 * The parent arranges multiple StatsCards in a row — this component renders one.
 *
 * @see docs/design/screens/user-account-1.png — paired cards (24H CHANGE / EARNINGS TO DATE)
 * @see docs/design/screens/creator-token.png — inline row (PRICE / 24H CHANGE / MARKET CAP)
 */
export function StatsCard({
  label,
  value,
  variant = 'card',
  valueColor = 'positive',
  prefix,
  suffix,
  style,
}: StatsCardProps) {
  const isCard = variant === 'card';
  const color = VALUE_COLORS[valueColor];

  return (
    <View
      style={[
        isCard ? styles.cardContainer : styles.inlineContainer,
        style,
      ]}
    >
      <Text
        variant="label"
        style={[
          styles.label,
          isCard ? styles.labelCard : styles.labelInline,
        ]}
      >
        {label}
      </Text>

      <View style={styles.valueRow}>
        {prefix ? (
          <Text
            variant="body"
            style={[
              isCard ? styles.valueCard : styles.valueInline,
              { color },
            ]}
          >
            {prefix}
          </Text>
        ) : null}

        <Text
          variant="body"
          style={[
            isCard ? styles.valueCard : styles.valueInline,
            { color },
          ]}
        >
          {value}
        </Text>

        {suffix ? (
          <Text
            variant="caption"
            style={[
              styles.suffix,
              { color: COLORS.textTertiary },
            ]}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card variant — dark box with padding
  cardContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  // Inline variant — transparent, centered
  inlineContainer: {
    alignItems: 'center',
  },

  label: {
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    textTransform: 'uppercase',
  },
  labelCard: {
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  labelInline: {
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  valueCard: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  valueInline: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  suffix: {
    fontSize: 10,
    marginLeft: 2,
  },
});
