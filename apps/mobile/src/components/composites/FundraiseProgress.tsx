import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { usdcToDisplay, formatUsd, clampPct } from '@/utils/tokenAmount';

type FundraiseStatusStr =
  | 'DRAFT'
  | 'ACTIVE'
  | 'THRESHOLD_MET'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED';

export interface FundraiseProgressProps {
  raisedBaseUnits: string;
  thresholdBaseUnits: string;
  /** Server-provided progress %; recomputed from raised/threshold if omitted. */
  progressPct?: number;
  quoteMint?: string;
  /** Decimals of the quote token. Default 6 (USDC). */
  quoteDecimals?: number;
  contributorCount?: number;
  status: FundraiseStatusStr;
  graduatedAt?: number | null;
  /** Compact = bar + inline line only (no status chip / contributor row). */
  compact?: boolean;
  style?: ViewStyle;
}

interface ChipSpec {
  label: string;
  color: string;
  bg: string;
}

function statusChip(
  status: FundraiseStatusStr,
  graduatedAt?: number | null,
): ChipSpec {
  if (graduatedAt || status === 'COMPLETED') {
    return { label: 'GRADUATED', color: COLORS.primary, bg: COLORS.primaryMuted };
  }
  switch (status) {
    case 'ACTIVE':
      return { label: 'LIVE', color: COLORS.primary, bg: COLORS.primaryMuted };
    case 'THRESHOLD_MET':
      return { label: 'TARGET MET', color: COLORS.primary, bg: COLORS.primaryMuted };
    case 'FINALIZING':
      return { label: 'GRADUATING…', color: COLORS.warning, bg: 'rgba(255,184,0,0.15)' };
    case 'FAILED':
      return { label: 'FAILED', color: COLORS.error, bg: 'rgba(255,68,68,0.15)' };
    case 'REFUNDED':
      return { label: 'REFUNDED', color: COLORS.error, bg: 'rgba(255,68,68,0.15)' };
    default:
      return { label: 'DRAFT', color: COLORS.textTertiary, bg: COLORS.surfaceElevated };
  }
}

/**
 * Fundraise progress bar + raised/threshold line + status chip.
 * Divide-by-zero guarded; quote amounts default to USDC (6 decimals).
 */
export function FundraiseProgress({
  raisedBaseUnits,
  thresholdBaseUnits,
  progressPct,
  quoteDecimals = 6,
  contributorCount,
  status,
  graduatedAt,
  compact = false,
  style,
}: FundraiseProgressProps) {
  let pct: number;
  if (progressPct != null) {
    pct = clampPct(progressPct);
  } else {
    let computed = 0;
    try {
      const threshold = BigInt(thresholdBaseUnits || '0');
      const raised = BigInt(raisedBaseUnits || '0');
      if (threshold > 0n) {
        computed = Number((raised * 10000n) / threshold) / 100;
      }
    } catch {
      computed = 0;
    }
    pct = clampPct(computed);
  }

  const isUsdc = quoteDecimals === 6;
  const raisedStr = isUsdc ? usdcToDisplay(raisedBaseUnits) : formatUsd(raisedBaseUnits, quoteDecimals);
  const thresholdStr = isUsdc ? usdcToDisplay(thresholdBaseUnits) : formatUsd(thresholdBaseUnits, quoteDecimals);
  const chip = statusChip(status, graduatedAt);

  return (
    <View style={[styles.container, style]}>
      {!compact && (
        <View style={styles.headerRow}>
          <Text variant="label" style={styles.title}>
            FUNDRAISE
          </Text>
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text variant="caption" style={[styles.chipText, { color: chip.color }]}>
              {chip.label}
            </Text>
          </View>
        </View>
      )}

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
        accessibilityLabel={`Raised ${raisedStr} of ${thresholdStr}, ${Math.round(pct)} percent`}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.infoRow}>
        <Text variant="caption" style={styles.raised}>
          RAISED {raisedStr} / {thresholdStr}
        </Text>
        <Text variant="caption" style={styles.pct}>
          {Math.round(pct)}%
        </Text>
      </View>

      {!compact && contributorCount != null && (
        <Text variant="caption" style={styles.contributors}>
          {contributorCount} {contributorCount === 1 ? 'CONTRIBUTOR' : 'CONTRIBUTORS'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    color: COLORS.textSecondary,
  },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADII.full,
  },
  chipText: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  track: {
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  raised: {
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  pct: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  contributors: {
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
    letterSpacing: 1,
  },
});
