import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { MOMENTO_FEE } from '@momento/shared';
import { bpsToPct, baseToDisplay } from '@/utils/tokenAmount';

export interface FeeDisclosureProps {
  /** Tunes the copy. Default 'trade'. */
  variant?: 'trade' | 'launch' | 'vesting';
  /** Default 'expandable'. */
  display?: 'inline' | 'card' | 'expandable';
  /** Default MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS. */
  transferFeeBps?: number;
  /** Default MOMENTO_FEE.TARGET_IN_APP_BPS (100). */
  effectiveInAppBps?: number;
  /** Derived = transferFeeBps - effectiveInAppBps when omitted. */
  rebateBps?: number;
  /** Live rebate amount (base units) to surface, if known. */
  inAppRebateBase?: string;
  rebateMint?: string;
  /** Token symbol for context copy. */
  symbol?: string;
  style?: ViewStyle;
}

/**
 * THE single source of fee/tax copy across trade / launch / vesting.
 *
 * Honesty guardrails (required): the ~1% is the EFFECTIVE/net rate after rebate;
 * the full transfer fee is charged on-chain first and the rebate arrives via a
 * later sweep (not instant). Vesting context: NO rebate on withdrawals and net
 * received may be slightly less due to the transfer fee. Every variant ends with
 * "Not financial or tax advice." Never claims "no fee" or "free".
 */
export function FeeDisclosure({
  variant = 'trade',
  display = 'expandable',
  transferFeeBps = MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS,
  effectiveInAppBps = MOMENTO_FEE.TARGET_IN_APP_BPS,
  rebateBps,
  inAppRebateBase,
  rebateMint,
  symbol,
  style,
}: FeeDisclosureProps) {
  const [expanded, setExpanded] = useState(display !== 'expandable');

  const derivedRebateBps =
    rebateBps ?? Math.max(0, transferFeeBps - effectiveInAppBps);

  const lines = buildLines(
    variant,
    transferFeeBps,
    effectiveInAppBps,
    derivedRebateBps,
    inAppRebateBase,
    rebateMint,
    symbol,
  );

  const headline = `EFFECTIVE FEE ≈ ${bpsToPct(effectiveInAppBps)}`;

  const body = (
    <>
      {lines.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text variant="caption" style={styles.bulletText}>
            {line}
          </Text>
        </View>
      ))}
      <Text variant="caption" style={styles.disclaimer}>
        Not financial or tax advice.
      </Text>
    </>
  );

  if (display === 'inline') {
    return (
      <View style={[styles.inline, style]}>
        <Ionicons name="shield-checkmark" size={14} color={COLORS.textTertiary} />
        <Text variant="caption" style={styles.inlineText}>
          {headline} · transfer fee {bpsToPct(transferFeeBps)} (rebate later).
          Not financial or tax advice.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <Pressable
        style={styles.header}
        onPress={() =>
          display === 'expandable' ? setExpanded((p) => !p) : undefined
        }
        disabled={display !== 'expandable'}
        accessibilityRole={display === 'expandable' ? 'button' : undefined}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
          <Text variant="label" style={styles.headerText}>
            {headline}
          </Text>
        </View>
        {display === 'expandable' && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.textTertiary}
          />
        )}
      </Pressable>
      {expanded && <View style={styles.bodyWrap}>{body}</View>}
    </View>
  );
}

function buildLines(
  variant: 'trade' | 'launch' | 'vesting',
  transferFeeBps: number,
  effectiveInAppBps: number,
  rebateBps: number,
  inAppRebateBase?: string,
  rebateMint?: string,
  symbol?: string,
): string[] {
  const sym = symbol ? `$${symbol}` : 'this token';
  const transfer = bpsToPct(transferFeeBps);
  const effective = bpsToPct(effectiveInAppBps);
  const rebate = bpsToPct(rebateBps);

  if (variant === 'vesting') {
    return [
      `Withdrawals from vesting do NOT receive the in-app rebate.`,
      `${sym} has a ${transfer} on-chain transfer fee, so the net amount received may be slightly less than the gross claimable.`,
      `Amounts shown are gross; the transfer fee is deducted on-chain at withdrawal.`,
    ];
  }

  if (variant === 'launch') {
    return [
      `Your token carries a ${transfer} on-chain transfer fee (Token-2022).`,
      `Momento rebates part of it so the effective in-app fee is ≈ ${effective}.`,
      `The full transfer fee is charged on-chain first; the ${rebate} rebate is paid later via a sweep, not instantly.`,
      `Trading fees are split between you (creator) and Momento per your selected split.`,
    ];
  }

  // trade. Rebate is paid in USDC (6 dp) today; append the unit so the figure
  // isn't an ambiguous bare number.
  const rebateLine = inAppRebateBase
    ? `Estimated rebate on this trade: ${baseToDisplay(inAppRebateBase, 6, { maxFracDigits: 4 })} USDC (paid later).`
    : `The ${rebate} rebate is paid later via a sweep, not instantly.`;
  return [
    `${sym} has a ${transfer} on-chain transfer fee charged at the time of trade.`,
    `Momento rebates part of it, making the effective fee ≈ ${effective}.`,
    rebateLine,
  ];
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  headerText: {
    color: COLORS.textPrimary,
  },
  bodyWrap: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textTertiary,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    color: COLORS.textSecondary,
    lineHeight: 16,
    textTransform: 'none',
  },
  disclaimer: {
    color: COLORS.textTertiary,
    fontStyle: 'italic',
    marginTop: SPACING.xs,
    textTransform: 'none',
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  inlineText: {
    flex: 1,
    color: COLORS.textTertiary,
    lineHeight: 16,
    textTransform: 'none',
  },
});
