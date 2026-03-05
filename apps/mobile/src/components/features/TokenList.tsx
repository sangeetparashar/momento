import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import type { TokenHolding } from '@momento/shared';

interface TokenListProps {
  tokens: TokenHolding[];
  onBuyPress?: (token: TokenHolding) => void;
}

export function TokenList({ tokens, onBuyPress }: TokenListProps) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.tokenColumn]}>TOKEN</Text>
        <Text style={[styles.headerCell, styles.changeColumn]}>24HR</Text>
        <Text style={[styles.headerCell, styles.valueColumn]}>VALUE</Text>
        <Text style={[styles.headerCell, styles.buyColumn]}>BUY</Text>
      </View>

      {/* Rows */}
      {tokens.map((token) => (
        <View key={token.mint} style={styles.row}>
          <View style={[styles.tokenColumn, styles.tokenInfo]}>
            {token.logoUrl ? (
              <Image
                source={{ uri: token.logoUrl }}
                style={styles.tokenLogo}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.tokenLogo, styles.tokenLogoFallback]}>
                <Text style={styles.tokenLogoText}>
                  {token.symbol.charAt(0)}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.tokenSymbol}>{token.symbol}</Text>
              <Text style={styles.tokenName} numberOfLines={1}>
                {token.name}
              </Text>
            </View>
          </View>

          <View style={styles.changeColumn}>
            <Text
              style={[
                styles.changeText,
                {
                  color:
                    (token.change24h ?? 0) >= 0
                      ? COLORS.success
                      : COLORS.error,
                },
              ]}
            >
              {(token.change24h ?? 0) >= 0 ? '+' : ''}
              {formatPercentage(token.change24h ?? 0)}
            </Text>
          </View>

          <View style={styles.valueColumn}>
            <Text style={styles.valueText}>
              {formatCurrency(token.valueUsd ?? 0)}
            </Text>
          </View>

          <View style={styles.buyColumn}>
            <Pressable
              onPress={() => onBuyPress?.(token)}
              style={styles.buyButton}
            >
              <Text style={styles.buyButtonText}>BUY</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {tokens.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tokens yet</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    marginHorizontal: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerCell: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tokenColumn: {
    flex: 2,
  },
  changeColumn: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  valueColumn: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  buyColumn: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tokenLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenLogoFallback: {
    backgroundColor: COLORS.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenLogoText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  tokenSymbol: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  tokenName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    maxWidth: 70,
  },
  changeText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
  valueText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  buyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.full,
  },
  buyButtonText: {
    ...TYPOGRAPHY.label,
    color: COLORS.background,
    fontWeight: '800',
  },
  emptyState: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
  },
});
