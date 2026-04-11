import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text, Card } from '@/components/primitives';
import { PortfolioRow } from './PortfolioRow';
import type { PortfolioRowProps } from './PortfolioRow';
import { COLORS, SPACING } from '@/styles/theme';
import { FONT_FAMILY_DISPLAY_BOLD } from '@/styles/typography';

interface PortfolioTableProps {
  /** Section title. e.g. "PORTFOLIO", "TRENDING". */
  title?: string;
  /** Row data. Each maps to a PortfolioRow. */
  rows: PortfolioRowProps[];
  /** Whether to show header labels. Default true. */
  showHeader?: boolean;
  /** Whether to wrap in a Card (surface bg + border). Default false. */
  cardWrapped?: boolean;
  /** Whether to show the SELL column. Default false. */
  showSellColumn?: boolean;
  /** Message shown when rows is empty. Default "NO TOKENS". */
  emptyMessage?: string;
  /** Called when any row is pressed. Receives the row index. */
  onRowPress?: (index: number) => void;
  /** Style override. */
  style?: ViewStyle;
}

/**
 * Token portfolio/market table with optional header row and card wrapper.
 *
 * Renders a title, column header labels, and a list of PortfolioRow components.
 * NOT virtualized (these lists are short, 5-20 items, and often live inside ScrollView).
 *
 * @see docs/design/screens/user-account-1.png — PORTFOLIO section
 * @see docs/design/screens/market.png — TRENDING table in a card
 */
export function PortfolioTable({
  title,
  rows,
  showHeader = true,
  cardWrapped = false,
  showSellColumn = false,
  emptyMessage = 'NO TOKENS',
  onRowPress,
  style,
}: PortfolioTableProps) {
  const content = (
    <>
      {/* Title (inside card if cardWrapped) */}
      {title && cardWrapped && (
        <Text variant="label" style={styles.titleInside}>
          {title}
        </Text>
      )}

      {/* Header row */}
      {showHeader && (
        <View style={styles.headerRow}>
          <View style={styles.starCol} />
          <View style={styles.tokenCol}>
            <Text variant="caption" style={styles.headerLabel}>
              TOKEN
            </Text>
          </View>
          <View style={styles.changeCol}>
            <Text variant="caption" style={styles.headerLabel}>
              24HR
            </Text>
          </View>
          <View style={styles.priceCol}>
            <Text variant="caption" style={styles.headerLabel}>
              {showSellColumn ? 'MARKET CAP' : 'PRICE'}
            </Text>
          </View>
          <View style={styles.actionCol}>
            <Text variant="caption" style={styles.headerLabel}>
              BUY
            </Text>
          </View>
          {showSellColumn && (
            <View style={styles.actionCol}>
              <Text variant="caption" style={styles.headerLabel}>
                SELL
              </Text>
            </View>
          )}
          {/* Spacer for arrow column */}
          <View style={styles.arrowCol} />
        </View>
      )}

      {/* Rows */}
      {rows.length > 0 ? (
        rows.map((rowProps, index) => (
          <PortfolioRow
            key={rowProps.symbol + index}
            {...rowProps}
            onPress={onRowPress ? () => onRowPress(index) : rowProps.onPress}
          />
        ))
      ) : (
        <View style={styles.emptyContainer}>
          <Text variant="caption" color="textTertiary">
            {emptyMessage}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <View style={style}>
      {/* Title (outside card if not cardWrapped) */}
      {title && !cardWrapped && (
        <Text variant="label" style={styles.titleOutside}>
          {title}
        </Text>
      )}

      {cardWrapped ? (
        <Card variant="flat">{content}</Card>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleOutside: {
    fontSize: 12,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.md,
  },
  titleInside: {
    fontSize: 12,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
    marginBottom: SPACING.md,
  },

  // Header row — mirrors PortfolioRow column layout
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY_DISPLAY_BOLD,
  },

  // Column widths — MUST match PortfolioRow
  starCol: { width: 20 },
  tokenCol: { flex: 2, flexDirection: 'row' },
  changeCol: { flex: 1, minWidth: 40 },
  priceCol: { flex: 1.5 },
  actionCol: { width: 36, alignItems: 'center' },
  arrowCol: { width: 24 },

  // Empty
  emptyContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
});
