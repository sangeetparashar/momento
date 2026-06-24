import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { PillTabs } from '@/components/composites';
import {
  VestingScheduleCard,
  VestingWithdrawSheet,
  VestingSkeleton,
} from '@/components/features';
import { useVestingList } from '@/hooks';
import { formatBaseUnits } from '@/utils/tokenAmount';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import type { VestingListItem } from '@/services/tokenApi.types';

type Role = 'recipient' | 'sender';

const ROLE_TABS = [
  { key: 'recipient', label: 'RECIPIENT' },
  { key: 'sender', label: 'SENDER' },
];

const DEFAULT_DECIMALS = 9;

/**
 * Vesting LIST (`/vesting`).
 *
 * RECIPIENT | SENDER role toggle (drives `role=` on GET /vesting/list, §d.8) +
 * a summary strip (CLAIMABLE NOW / TOTAL). FlatList of `VestingScheduleCard`;
 * recipient cards open the `VestingWithdrawSheet`. States: skeleton (loading),
 * role-specific empty copy, error banner + RETRY, pull-to-refresh.
 */
export default function VestingScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('recipient');
  const [selected, setSelected] = useState<VestingListItem | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const {
    data: schedules,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useVestingList(role);

  // Summary strip: sum claimable + total across all rows for this role.
  // Note: rows can be mixed-mint; the strip is a coarse roll-up, so amounts of
  // differing decimals share one figure — acceptable for an at-a-glance total.
  const summary = useMemo(() => {
    if (!schedules || schedules.length === 0) return null;
    let claimable = 0n;
    let total = 0n;
    let decimals: number | null = null;
    let mixed = false;
    for (const s of schedules) {
      const d = s.decimals ?? DEFAULT_DECIMALS;
      if (decimals == null) decimals = d;
      else if (d !== decimals) mixed = true;
      try {
        claimable += BigInt(s.claimableBase || '0');
        total += BigInt(s.totalBase || '0');
      } catch {
        /* skip malformed row */
      }
    }
    return {
      claimable: claimable.toString(),
      total: total.toString(),
      decimals: decimals ?? DEFAULT_DECIMALS,
      mixed,
    };
  }, [schedules]);

  const openWithdraw = useCallback((schedule: VestingListItem) => {
    setSelected(schedule);
    setSheetVisible(true);
  }, []);

  const closeWithdraw = useCallback(() => {
    setSheetVisible(false);
    // Keep `selected` until the sheet finishes animating out, then clear.
    setTimeout(() => setSelected(null), 250);
  }, []);

  const handleBack = useCallback(() => router.back(), [router]);

  const renderItem = useCallback(
    ({ item }: { item: VestingListItem }) => (
      <VestingScheduleCard
        schedule={item}
        role={role}
        onWithdraw={role === 'recipient' ? openWithdraw : undefined}
      />
    ),
    [role, openWithdraw],
  );

  const keyExtractor = useCallback((item: VestingListItem) => item.vestingId, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text variant="label" style={styles.headerTitle}>
          VESTING
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* Role toggle */}
      <View style={styles.tabsWrap}>
        <PillTabs
          tabs={ROLE_TABS}
          activeTab={role}
          onTabChange={(k) => setRole(k as Role)}
        />
      </View>

      {/* Summary strip. When schedules span different decimals/mints, a single
          summed figure is meaningless, so we suppress the roll-up and show a
          caveat instead of a misleading number. */}
      {summary && (
        summary.mixed ? (
          <View style={[styles.summary, styles.summaryMixed]}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textTertiary} />
            <Text variant="caption" style={styles.summaryMixedText}>
              Schedules span multiple tokens — see each row for amounts.
            </Text>
          </View>
        ) : (
          <View style={styles.summary}>
            <View style={styles.summaryCol}>
              <Text variant="label" style={styles.summaryLabel}>
                CLAIMABLE NOW
              </Text>
              <Text variant="mono" style={styles.summaryValueAccent} numberOfLines={1}>
                {formatBaseUnits(summary.claimable, summary.decimals, 4)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text variant="label" style={styles.summaryLabel}>
                TOTAL {role === 'recipient' ? 'VESTING' : 'GRANTED'}
              </Text>
              <Text variant="mono" style={styles.summaryValue} numberOfLines={1}>
                {formatBaseUnits(summary.total, summary.decimals, 4)}
              </Text>
            </View>
          </View>
        )
      )}

      {/* Body */}
      {isLoading && !schedules ? (
        <View style={styles.listContent}>
          <VestingSkeleton count={3} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={COLORS.textTertiary}
          />
          <Text variant="body" style={styles.centerText}>
            COULDN'T LOAD VESTING
          </Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => refetch()}
            accessibilityRole="button"
          >
            <Text variant="label" style={styles.retryText}>
              RETRY
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={schedules ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="time-outline"
                size={48}
                color={COLORS.textTertiary}
              />
              <Text variant="body" style={styles.centerText}>
                {role === 'recipient'
                  ? 'NO VESTING SCHEDULES'
                  : 'NO GRANTS CREATED'}
              </Text>
              <Text variant="caption" style={styles.centerHint}>
                {role === 'recipient'
                  ? 'Tokens vested to you will appear here.'
                  : 'Vesting schedules you create for your token will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Withdraw sheet (recipient-only) */}
      <VestingWithdrawSheet
        visible={sheetVisible}
        schedule={selected}
        onClose={closeWithdraw}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    letterSpacing: 2,
  },
  tabsWrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  summary: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  summaryMixed: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  summaryMixedText: {
    flex: 1,
    color: COLORS.textTertiary,
    textTransform: 'none',
    lineHeight: 16,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  summaryLabel: {
    color: COLORS.textTertiary,
    fontSize: 10,
  },
  summaryValue: {
    color: COLORS.textPrimary,
  },
  summaryValueAccent: {
    color: COLORS.primary,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    flexGrow: 1,
  },
  separator: {
    height: SPACING.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
  },
  centerText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  centerHint: {
    color: COLORS.textTertiary,
    textAlign: 'center',
    textTransform: 'none',
    lineHeight: 18,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  retryText: {
    color: COLORS.textPrimary,
  },
});
