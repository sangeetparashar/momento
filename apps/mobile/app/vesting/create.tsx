import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, FormField } from '@/components/primitives';
import { PillTabs, FeeDisclosure } from '@/components/composites';
import { useCreateVesting, useTokenDetail } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks';
import { displayToBase } from '@/utils/tokenAmount';
import { showErrorToast, showSuccessToast } from '@/utils/toast';
import { UserRole } from '@momento/shared';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import type { VestingCreateRequest } from '@/services/tokenApi.types';

type Kind = 'vesting' | 'lock';

const KIND_TABS = [
  { key: 'vesting', label: 'VESTING' },
  { key: 'lock', label: 'LOCK' },
];

const DAY_SECONDS = 86400;

/**
 * Creator-only CREATE VESTING / LOCK (`/vesting/create`).
 *
 * Consumes `useCreateVesting` (POST /vesting/create, §d.7) which handles the
 * `signMode` discriminator internally: server → already submitted; client →
 * sign-and-send the returned tx. Reachable from the launch result hand-off with
 * prefilled params (mint / tokenId / symbol / amountWhole / durationDays /
 * cliffDays). Whole-token amounts convert to base units with `displayToBase`
 * (BigInt). Times are unix seconds derived from cliff/duration days.
 */
export default function VestingCreateScreen() {
  const router = useRouter();
  const { walletAddress } = useAuth();
  const { user, isLoading: isProfileLoading } = useUserProfile();
  const createVesting = useCreateVesting();

  const params = useLocalSearchParams<{
    mint?: string;
    tokenId?: string;
    symbol?: string;
    amountWhole?: string;
    durationDays?: string;
    cliffDays?: string;
  }>();

  const mint = params.mint ?? user?.tokenMint ?? '';
  const tokenId = params.tokenId ?? user?.tokenId ?? '';

  // Real token decimals (launch allows 6–9). Convert whole-token amounts to base
  // units with THIS, never a hardcoded 9 — a 6-dp token would otherwise inflate
  // the gross deposit by 1000×. Gate the form until decimals are known.
  const { data: token, isLoading: isTokenLoading } = useTokenDetail(mint);
  const decimals = token?.decimals;
  const symbol = params.symbol ?? token?.symbol ?? user?.tokenSymbol ?? 'TOKEN';

  const [kind, setKind] = useState<Kind>('vesting');
  const [recipient, setRecipient] = useState('');
  const [amountWhole, setAmountWhole] = useState(params.amountWhole ?? '');
  const [cliffDays, setCliffDays] = useState(params.cliffDays ?? '0');
  const [durationDays, setDurationDays] = useState(params.durationDays ?? '365');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isCreator = user?.role === UserRole.CREATOR;

  // Build + validate the §d.7 payload. Returns null on validation failure
  // (mirrors vestingCreateSchema: positive amount, cliffAt>=startAt,
  // endAt>cliffAt, (endAt-cliffAt) % unlockEvery === 0).
  const buildPayload = useCallback((): VestingCreateRequest | null => {
    const e: Record<string, string> = {};

    if (!mint) e.mint = 'Missing token mint.';
    if (!tokenId) e.tokenId = 'Missing token id.';
    if (decimals == null) e.mint = 'Token details are still loading. Try again.';
    if (!recipient.trim()) e.recipient = 'Recipient wallet is required.';

    let amountBase = '0';
    try {
      // Use the real token decimals; a missing value is a hard error (above)
      // rather than a silent assumption of 9.
      amountBase = displayToBase(amountWhole.trim(), decimals ?? 9);
      if (BigInt(amountBase) <= 0n) e.amount = 'Enter an amount greater than zero.';
    } catch {
      e.amount = 'Invalid amount.';
    }

    const cliff = Number(cliffDays);
    const duration = Number(durationDays);
    if (!Number.isFinite(duration) || duration <= 0) {
      e.duration = 'Duration must be a positive number of days.';
    }
    if (!Number.isFinite(cliff) || cliff < 0) {
      e.cliff = 'Cliff cannot be negative.';
    }
    if (Number.isFinite(cliff) && Number.isFinite(duration) && cliff > duration) {
      e.cliff = 'Cliff cannot exceed the total duration.';
    }

    setErrors(e);
    if (Object.keys(e).length > 0) return null;

    const now = Math.floor(Date.now() / 1000);
    const startAt = now;
    const cliffAt = now + Math.round(cliff) * DAY_SECONDS;
    const endAt = now + Math.round(duration) * DAY_SECONDS;
    // Daily ticks; endAt-cliffAt is an exact multiple of DAY_SECONDS by
    // construction (both are day-aligned offsets from `now`).
    const unlockEvery = DAY_SECONDS;

    return {
      kind,
      tokenId,
      mint,
      recipient: recipient.trim(),
      amountBase,
      cliffAmountBase: '0',
      startAt,
      cliffAt: Math.max(cliffAt, startAt),
      endAt: Math.max(endAt, cliffAt + unlockEvery),
      unlockEvery,
    };
  }, [mint, tokenId, decimals, recipient, amountWhole, cliffDays, durationDays, kind]);

  const handleCreate = useCallback(() => {
    const payload = buildPayload();
    if (!payload) return;

    createVesting.mutate(payload, {
      onSuccess: () => {
        showSuccessToast(
          kind === 'lock' ? 'Token lock created' : 'Vesting schedule created',
        );
        router.replace('/vesting');
      },
      onError: (err: any) => {
        showErrorToast(err?.message ?? 'Failed to create vesting');
      },
    });
  }, [buildPayload, createVesting, kind, router]);

  const handleBack = useCallback(() => router.back(), [router]);

  const ctaLabel = useMemo(
    () => (kind === 'lock' ? `LOCK $${symbol}` : `CREATE VESTING`),
    [kind, symbol],
  );

  // ── Guards ──
  // While the profile is still loading, don't evaluate role/wallet guards (they
  // would all be false and briefly flash the full form). Show a spinner instead.
  if (isProfileLoading && !user) {
    return (
      <SafeAreaView style={[styles.container, styles.guard]} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }
  if (user && !isCreator) {
    return (
      <Guard
        icon="person-outline"
        title="CREATORS ONLY"
        message="Creating vesting schedules is a creator feature."
        ctaLabel="GO BACK"
        onPress={handleBack}
      />
    );
  }
  if (!walletAddress) {
    return (
      <Guard
        icon="wallet-outline"
        title="WALLET NOT READY"
        message="Your Momento wallet is still setting up. Try again in a moment."
        ctaLabel="GO BACK"
        onPress={handleBack}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text variant="label" style={styles.headerTitle}>
          SET UP VESTING
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="bodySmall" style={styles.intro}>
            Vest or lock ${symbol}. Vesting is cancelable by you; a lock is
            irreversible.
          </Text>

          <View style={styles.tabsWrap}>
            <PillTabs
              tabs={KIND_TABS}
              activeTab={kind}
              onTabChange={(k) => setKind(k as Kind)}
            />
          </View>

          <FormField
            label={kind === 'lock' ? 'LOCK RECIPIENT (WALLET)' : 'RECIPIENT (WALLET)'}
            value={recipient}
            onChangeText={setRecipient}
            placeholder="9aZ…"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.recipient}
          />

          <FormField
            label="AMOUNT"
            value={amountWhole}
            onChangeText={(t) => setAmountWhole(t.replace(/[^0-9.]/g, ''))}
            placeholder="50000000"
            keyboardType="decimal-pad"
            affix={symbol}
            error={errors.amount}
          />

          {kind === 'vesting' ? (
            <FormField
              label="CLIFF (DAYS)"
              value={cliffDays}
              onChangeText={(t) => setCliffDays(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
              affix="DAYS"
              error={errors.cliff}
            />
          ) : null}

          <FormField
            label={kind === 'lock' ? 'LOCK DURATION (DAYS)' : 'DURATION (DAYS)'}
            value={durationDays}
            onChangeText={(t) => setDurationDays(t.replace(/[^0-9]/g, ''))}
            placeholder="365"
            keyboardType="number-pad"
            affix="DAYS"
            error={errors.duration}
          />

          {(() => {
            const missingId =
              (!mint && 'Missing token mint.') ||
              (!tokenId && 'Missing token id.') ||
              errors.mint ||
              errors.tokenId;
            return missingId ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text variant="caption" style={styles.errorBannerText}>
                  {missingId}
                </Text>
              </View>
            ) : null;
          })()}

          <FeeDisclosure
            variant="vesting"
            display="card"
            symbol={symbol}
            style={styles.disclosure}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={isTokenLoading && decimals == null ? 'LOADING TOKEN…' : ctaLabel}
            fullWidth
            loading={createVesting.isPending}
            disabled={createVesting.isPending || decimals == null}
            onPress={handleCreate}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Guard({
  icon,
  title,
  message,
  ctaLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  ctaLabel: string;
  onPress: () => void;
}) {
  return (
    <SafeAreaView style={[styles.container, styles.guard]} edges={['top']}>
      <Ionicons name={icon} size={48} color={COLORS.textTertiary} />
      <Text variant="h3" style={styles.guardTitle}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.guardMessage}>
        {message}
      </Text>
      <Button label={ctaLabel} variant="secondary" onPress={onPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: { flex: 1 },
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
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  intro: {
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.lg,
    textTransform: 'none',
  },
  tabsWrap: {
    marginBottom: SPACING.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.error,
    textTransform: 'none',
  },
  disclosure: {
    marginTop: SPACING.xs,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  guard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  guardTitle: {
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  guardMessage: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
});
