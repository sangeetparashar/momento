import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from '@/components/primitives';
import { VestingProgressBar } from '@/components/composites';
import { formatBaseUnits } from '@/utils/tokenAmount';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import type { VestingListItem } from '@/services/tokenApi.types';

export interface VestingScheduleCardProps {
  schedule: VestingListItem;
  role: 'recipient' | 'sender';
  /** Recipient-only — open the withdraw sheet. */
  onWithdraw?: (s: VestingListItem) => void;
}

/** §d.8 may omit `decimals` on the list row (TODO(contract)) — default 9. */
const DEFAULT_DECIMALS = 9;

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

/**
 * Map the wire `status` (VestingStatus) to a display chip.
 * ACTIVE→VESTING, COMPLETED→FULLY VESTED, CANCELED/CANCELLED→CANCELLED,
 * PENDING→PENDING (creating), PAUSED→PAUSED. Unknown → raw value.
 */
function statusMeta(status: string): StatusMeta {
  switch (status) {
    case 'ACTIVE':
      return { label: 'VESTING', color: COLORS.primary, bg: COLORS.primaryMuted };
    case 'COMPLETED':
      return {
        label: 'FULLY VESTED',
        color: COLORS.textSecondary,
        bg: COLORS.surfaceElevated,
      };
    case 'CANCELED':
    case 'CANCELLED':
      return { label: 'CANCELLED', color: COLORS.error, bg: 'rgba(255,68,68,0.12)' };
    case 'PENDING':
      return { label: 'PENDING', color: COLORS.warning, bg: 'rgba(255,184,0,0.12)' };
    case 'PAUSED':
      return { label: 'PAUSED', color: COLORS.warning, bg: 'rgba(255,184,0,0.12)' };
    default:
      return {
        label: status || 'UNKNOWN',
        color: COLORS.textSecondary,
        bg: COLORS.surfaceElevated,
      };
  }
}

/** "in 12d", "in 5h", "in 30m" until the unix-seconds target, else null (passed). */
function countdownTo(unixSeconds: number): string | null {
  const now = Math.floor(Date.now() / 1000);
  const delta = unixSeconds - now;
  if (delta <= 0) return null;
  const days = Math.floor(delta / 86400);
  if (days >= 1) return `in ${days}d`;
  const hours = Math.floor(delta / 3600);
  if (hours >= 1) return `in ${hours}h`;
  const mins = Math.max(1, Math.floor(delta / 60));
  return `in ${mins}m`;
}

/**
 * One vesting/lock schedule row.
 *
 * Header: `$SYMBOL` + status pill. Sub-line: kind + cliff/end timing (pre-cliff
 * shows a countdown). `VestingProgressBar` (withdrawn solid / claimable 50%-alpha
 * / locked track). RELEASED / CLAIMABLE / LOCKED amounts via `formatBaseUnits`.
 * Recipient-only WITHDRAW CTA (filled when `claimableBase > 0`, disabled
 * "NOTHING TO WITHDRAW YET" otherwise). Senders never see a withdraw CTA.
 */
export function VestingScheduleCard({
  schedule,
  role,
  onWithdraw,
}: VestingScheduleCardProps) {
  const decimals = schedule.decimals ?? DEFAULT_DECIMALS;
  const kind = schedule.kind ?? 'vesting';
  const meta = statusMeta(schedule.status);

  const { released, claimable, locked, hasClaimable } = useMemo(() => {
    let total = 0n;
    let withdrawn = 0n;
    let claim = 0n;
    try {
      total = BigInt(schedule.totalBase || '0');
      withdrawn = BigInt(schedule.withdrawnBase || '0');
      claim = BigInt(schedule.claimableBase || '0');
    } catch {
      total = 0n;
      withdrawn = 0n;
      claim = 0n;
    }
    // Locked = total − withdrawn − claimable (clamped at 0).
    let lock = total - withdrawn - claim;
    if (lock < 0n) lock = 0n;
    return {
      released: withdrawn.toString(),
      claimable: claim.toString(),
      locked: lock.toString(),
      hasClaimable: claim > 0n,
    };
  }, [schedule.totalBase, schedule.withdrawnBase, schedule.claimableBase]);

  // Timing line: countdown to cliff if still locked, else end date.
  const cliffCountdown = countdownTo(schedule.cliffAt);
  const timingLine = cliffCountdown
    ? `Cliff ${cliffCountdown}`
    : `Fully vests ${formatDate(schedule.endAt)}`;

  const isRecipient = role === 'recipient';
  const isActive = schedule.status === 'ACTIVE';
  const canWithdraw = isRecipient && isActive && hasClaimable && !!onWithdraw;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text variant="h3" style={styles.symbol}>
          ${schedule.symbol}
        </Text>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <Text variant="label" style={[styles.pillText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>
      </View>

      {/* Kind + timing */}
      <Text variant="caption" style={styles.subLine}>
        {kind === 'lock' ? 'TOKEN LOCK' : 'VESTING'} · {timingLine}
      </Text>

      {/* Progress */}
      <VestingProgressBar
        totalBase={schedule.totalBase}
        withdrawnBase={schedule.withdrawnBase}
        claimableBase={schedule.claimableBase}
        height={8}
        style={styles.bar}
      />

      {/* Stats */}
      <View style={styles.statsRow}>
        <Stat label="RELEASED" value={formatBaseUnits(released, decimals, 4)} />
        <Stat
          label="CLAIMABLE"
          value={formatBaseUnits(claimable, decimals, 4)}
          valueColor={hasClaimable ? COLORS.primary : COLORS.textPrimary}
        />
        <Stat label="LOCKED" value={formatBaseUnits(locked, decimals, 4)} alignEnd />
      </View>

      {/* Recipient withdraw CTA */}
      {isRecipient && isActive ? (
        <Button
          label={canWithdraw ? 'WITHDRAW' : 'NOTHING TO WITHDRAW YET'}
          fullWidth
          disabled={!canWithdraw}
          onPress={() => onWithdraw?.(schedule)}
          style={styles.cta}
          accessibilityLabel={
            canWithdraw
              ? `Withdraw ${formatBaseUnits(claimable, decimals, 4)} ${schedule.symbol}`
              : 'Nothing to withdraw yet'
          }
        />
      ) : null}
    </View>
  );
}

function Stat({
  label,
  value,
  valueColor,
  alignEnd,
}: {
  label: string;
  value: string;
  valueColor?: string;
  alignEnd?: boolean;
}) {
  return (
    <View style={[styles.statCol, alignEnd && styles.statColEnd]}>
      <Text variant="label" style={styles.statLabel}>
        {label}
      </Text>
      <Text
        variant="mono"
        style={[styles.statValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function formatDate(unixSeconds: number): string {
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbol: {
    color: COLORS.textPrimary,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xxs,
    borderRadius: RADII.full,
  },
  pillText: {
    fontSize: 10,
    letterSpacing: 1,
  },
  subLine: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textTransform: 'none',
  },
  bar: {
    marginTop: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  statCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statColEnd: {
    alignItems: 'flex-end',
  },
  statLabel: {
    color: COLORS.textTertiary,
    fontSize: 10,
  },
  statValue: {
    color: COLORS.textPrimary,
    marginTop: SPACING.xxs,
  },
  cta: {
    marginTop: SPACING.lg,
  },
});
