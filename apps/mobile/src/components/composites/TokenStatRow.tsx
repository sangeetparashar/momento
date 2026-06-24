import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatsCard } from './StatsCard';
import { SPACING } from '@/styles/theme';

export interface TokenStatRowProps {
  priceUsd: number;
  change24hPct?: number;
  marketCapUsd: number;
}

/** Format a USD number compactly: $1.2K, $3.4M, $0.0042. */
function formatUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return '$0';
  // Sub-dollar: show enough precision for low-priced tokens.
  return `$${n.toPrecision(2)}`;
}

/**
 * Inline token metric row. Renders PRICE / 24H CHANGE / MARKET CAP when a 24h
 * change value is supplied; otherwise it falls back to a 2-up PRICE / MARKET CAP
 * row rather than shipping a permanently-empty "—" focal stat (the detail
 * response has no 24h-change field yet).
 */
export function TokenStatRow({
  priceUsd,
  change24hPct,
  marketCapUsd,
}: TokenStatRowProps) {
  const hasChange = change24hPct != null && Number.isFinite(change24hPct);
  const changeStr = hasChange
    ? `${change24hPct! >= 0 ? '+' : ''}${change24hPct!.toFixed(1)}%`
    : '—';

  return (
    <View style={styles.row}>
      <StatsCard
        label="PRICE"
        value={formatUsdCompact(priceUsd)}
        variant="inline"
        valueColor="neutral"
        style={styles.cell}
      />
      {hasChange && (
        <StatsCard
          label="24H CHANGE"
          value={changeStr}
          variant="inline"
          valueColor={change24hPct! < 0 ? 'negative' : 'positive'}
          style={styles.cell}
        />
      )}
      <StatsCard
        label="MARKET CAP"
        value={formatUsdCompact(marketCapUsd)}
        variant="inline"
        valueColor="neutral"
        style={styles.cell}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: SPACING.md,
  },
  cell: {
    flex: 1,
  },
});
