import React from 'react';
import { View, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { baseToDisplay, usdcToDisplay } from '@/utils/tokenAmount';
import { CHAIN_CONFIG } from '@momento/shared';
import type { TradeFeedItem } from '@/services/tokenApi.types';

export interface RecentTradesListProps {
  trades: TradeFeedItem[];
  /** Decimals of the creator token (for amount formatting). */
  decimals: number;
  /** Token symbol for the row labels. */
  symbol: string;
}

const explorerBase = CHAIN_CONFIG.solana.explorerUrl;

/** Shorten a wallet/signature to head…tail. */
function shorten(addr: string, head = 4, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Relative time from an ISO/unix string (seconds or ms). */
function timeAgo(blockTime: string | null): string {
  if (!blockTime) return '—';
  let ms: number;
  const num = Number(blockTime);
  if (Number.isFinite(num) && blockTime.trim() !== '') {
    ms = num < 1e12 ? num * 1000 : num; // seconds vs ms heuristic
  } else {
    ms = Date.parse(blockTime);
  }
  if (!Number.isFinite(ms)) return '—';
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Recent on-chain trades for a token. Each row: BUY/SELL chip, token amount,
 * USDC value, trader (shortened), age. Tapping a row opens the tx on the
 * explorer. Empty/loading states are owned by the caller — this renders rows
 * (or a compact empty line when handed an empty array).
 */
export function RecentTradesList({ trades, decimals, symbol }: RecentTradesListProps) {
  if (!trades || trades.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="time-outline" size={20} color={COLORS.textTertiary} />
        <Text variant="caption" style={styles.emptyText}>
          NO TRADES YET
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {trades.map((t, i) => {
        const isBuy = t.side === 'BUY';
        // For a BUY the token is the OUTPUT; for a SELL the token is the INPUT.
        const tokenBase = isBuy ? t.amountOutBase : t.amountInBase;
        const usdcBase = isBuy ? t.amountInBase : t.amountOutBase;
        return (
          <Pressable
            key={`${t.signature}-${i}`}
            style={styles.row}
            onPress={() =>
              t.signature && Linking.openURL(`${explorerBase}/tx/${t.signature}`)
            }
            accessibilityRole="button"
            accessibilityLabel={`${t.side} ${baseToDisplay(tokenBase, decimals, { maxFracDigits: 2, group: true })} ${symbol}`}
          >
            <View
              style={[styles.sideChip, isBuy ? styles.buyChip : styles.sellChip]}
            >
              <Text
                variant="caption"
                style={[styles.sideText, { color: isBuy ? COLORS.primary : COLORS.error }]}
              >
                {t.side}
              </Text>
            </View>

            <View style={styles.amountCol}>
              <Text variant="bodySmall" style={styles.amount}>
                {baseToDisplay(tokenBase, decimals, { maxFracDigits: 2, group: true })} {symbol}
              </Text>
              <Text variant="caption" style={styles.usd}>
                {usdcToDisplay(usdcBase)}
              </Text>
            </View>

            <View style={styles.metaCol}>
              <Text variant="caption" style={styles.trader}>
                {shorten(t.traderWallet)}
              </Text>
              <Text variant="caption" style={styles.age}>
                {timeAgo(t.blockTime)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  sideChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  buyChip: {
    backgroundColor: COLORS.primaryMuted,
  },
  sellChip: {
    backgroundColor: 'rgba(255,68,68,0.15)',
  },
  sideText: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  amountCol: {
    flex: 1,
  },
  amount: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    textTransform: 'none',
  },
  usd: {
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  metaCol: {
    alignItems: 'flex-end',
  },
  trader: {
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  age: {
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textTertiary,
    letterSpacing: 1.5,
  },
});
