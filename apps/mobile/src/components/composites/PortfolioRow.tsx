import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, AnimatedPressable } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD, FONT_FAMILY_DISPLAY } from '@/styles/typography';

export interface ExpandedStat {
  /** Label. e.g. "1H", "7D", "24 VOLUME", "MARKET CAP". */
  label: string;
  /** Value. e.g. "11%", "6%", "2M", "10M/USD". */
  value: string;
  /** Whether value is positive (green). Default true. Negative = red, undefined = green. */
  positive?: boolean;
}

export interface PortfolioRowProps {
  /** Token symbol. e.g. "DEEL". */
  symbol: string;
  /** Avatar fallback color (hex). Used when no avatarUrl. */
  avatarColor?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** 24h change display string. e.g. "17%", "0.5%". */
  change: string;
  /** Whether the change is positive (green) or negative (red). */
  changePositive: boolean;
  /** Price display string. e.g. "10,631USD". */
  price: string;
  /** Called when BUY is tapped. */
  onBuy?: () => void;
  /** Called when SELL is tapped. If undefined, SELL column is hidden. */
  onSell?: () => void;
  /** Whether the row can expand to show detail stats. */
  expandable?: boolean;
  /** Controlled expanded state. If undefined, uses internal state. */
  expanded?: boolean;
  /** Called when expand arrow is tapped. */
  onToggleExpand?: () => void;
  /** Data shown when expanded. */
  expandedData?: ExpandedStat[];
  /** Whether the star is filled. */
  favorited?: boolean;
  /** Called when star is tapped. */
  onToggleFavorite?: () => void;
  /** Called when the row body is tapped (e.g. navigate to token). */
  onPress?: () => void;
  /** Style override for the outer container. */
  style?: ViewStyle;
}

/**
 * A single row in a token portfolio/market table.
 *
 * Shows: star | avatar + name | 24h change | price | BUY | [SELL] | expand arrow.
 * Optionally expands to show sub-stats (1H, 7D, 24 VOL, MARKET CAP).
 * Supports both controlled (parent manages expanded) and uncontrolled (internal state).
 *
 * @see docs/design/screens/market.png — TRENDING table rows
 * @see docs/design/screens/market-expanded.png — DEEL row expanded
 * @see docs/design/screens/user-account-1.png — PORTFOLIO rows
 */
export function PortfolioRow({
  symbol,
  avatarColor = COLORS.textTertiary,
  avatarUrl,
  change,
  changePositive,
  price,
  onBuy,
  onSell,
  expandable = false,
  expanded: controlledExpanded,
  onToggleExpand,
  expandedData,
  favorited = false,
  onToggleFavorite,
  onPress,
  style,
}: PortfolioRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggleExpand = useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  }, [onToggleExpand]);

  const changeColor = changePositive ? COLORS.primary : COLORS.error;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Main row — flat structure, no nested Pressables */}
      <View style={styles.row}>
        {/* Star */}
        <Pressable
          onPress={onToggleFavorite}
          style={styles.starCol}
          hitSlop={8}
          disabled={!onToggleFavorite}
        >
          <Ionicons
            name={favorited ? 'star' : 'star-outline'}
            size={14}
            color={favorited ? COLORS.primary : COLORS.textTertiary}
          />
        </Pressable>

        {/* Token info + change + price — tappable area for row navigation */}
        <Pressable
          onPress={onPress}
          style={styles.rowBody}
          disabled={!onPress}
        >
          <View style={styles.tokenCol}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: avatarColor },
              ]}
            />
            <Text variant="label" style={styles.tokenName}>
              {symbol}
            </Text>
          </View>

          <View style={styles.changeCol}>
            <Text
              variant="caption"
              style={[styles.changeText, { color: changeColor }]}
            >
              {change}
            </Text>
          </View>

          <View style={styles.priceCol}>
            <Text variant="caption" style={styles.priceText}>
              {price}
            </Text>
          </View>
        </Pressable>

        {/* BUY */}
        {onBuy && (
          <Pressable onPress={onBuy} style={styles.actionCol} hitSlop={6}>
            <Text variant="label" style={styles.buyText}>
              BUY
            </Text>
          </Pressable>
        )}

        {/* SELL */}
        {onSell && (
          <Pressable onPress={onSell} style={styles.actionCol} hitSlop={6}>
            <Text variant="label" style={styles.sellText}>
              SELL
            </Text>
          </Pressable>
        )}

        {/* Expand arrow */}
        {expandable && (
          <Pressable
            onPress={handleToggleExpand}
            style={styles.arrowCol}
            hitSlop={8}
          >
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.textTertiary}
            />
          </Pressable>
        )}
      </View>

      {/* Expanded detail */}
      {isExpanded && expandedData && expandedData.length > 0 && (
        <View style={styles.expandedRow}>
          {expandedData.map((stat) => (
            <View key={stat.label} style={styles.expandedStat}>
              <Text variant="caption" style={styles.expandedLabel}>
                {stat.label}
              </Text>
              <Text
                variant="caption"
                style={[
                  styles.expandedValue,
                  { color: stat.positive === false ? COLORS.error : COLORS.primary },
                ]}
              >
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Column widths — matches BUILD_SPEC.md and PortfolioTable header
  starCol: {
    width: 20,
    alignItems: 'center',
  },
  tokenCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changeCol: {
    width: 52,
  },
  priceCol: {
    flex: 1,
  },
  actionCol: {
    width: 40,
    alignItems: 'center',
  },
  arrowCol: {
    width: 24,
    alignItems: 'center',
  },

  // Avatar
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },

  // Text styles
  tokenName: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  priceText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY_DISPLAY,
  },
  buyText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },
  sellText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },

  // Expanded
  expandedRow: {
    flexDirection: 'row',
    gap: 20,
    paddingLeft: 28,
    paddingBottom: 10,
  },
  expandedStat: {},
  expandedLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: 2,
  },
  expandedValue: {
    fontSize: 11,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    fontWeight: '700',
  },
});
