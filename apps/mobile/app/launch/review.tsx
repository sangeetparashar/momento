import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Card } from '@/components/primitives';
import { FeeDisclosure } from '@/components/composites';
import { ReviewRow } from '@/components/features/launch/ReviewRow';
import { useLaunchWizard, LAUNCH_STEPS } from '@/hooks/useLaunchWizard';
import { useLaunchToken } from '@/hooks';
import { bpsToPct } from '@/utils/tokenAmount';
import { COLORS, SPACING, RADII } from '@/styles/theme';

/**
 * Step 5 — review every value, accept the launch disclaimer, then LAUNCH.
 *
 * Launch is SERVER-SIGNED (useLaunchToken): no client signature. On success the
 * mint/signatures land synchronously and we navigate to the result screen,
 * forwarding the identifiers + the (optional) vesting hand-off intent.
 */
export default function LaunchReviewScreen() {
  const router = useRouter();
  const { draft, validateStep, buildLaunchPayload } = useLaunchWizard();
  const launch = useLaunchToken();
  const [accepted, setAccepted] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const v = draft.vesting;

  const valuesValid = useMemo(() => {
    // Re-run every step's validators; any error blocks launch.
    return LAUNCH_STEPS.every(
      (s) => Object.keys(validateStep(s)).length === 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleLaunch = useCallback(() => {
    // Authoritative re-validation; jump to the first broken step.
    for (const s of LAUNCH_STEPS) {
      const e = validateStep(s);
      if (Object.keys(e).length > 0) {
        const route = s === 'basics' ? '/launch' : (`/launch/${s}` as const);
        Alert.alert('Incomplete', 'Some fields need attention.', [
          { text: 'FIX', onPress: () => router.push(route as any) },
        ]);
        return;
      }
    }

    const payload = buildLaunchPayload();
    setLaunchError(null);
    launch.mutate(payload, {
      onSuccess: (res) => {
        router.replace({
          pathname: '/launch/result',
          params: {
            mint: res.mintAddress,
            tokenId: res.tokenId,
            symbol: draft.symbol.toUpperCase(),
            status: res.status,
            // Vesting hand-off intent (form-only; consumed on result screen).
            vest: v.enabled ? '1' : '0',
            vestAmount: v.enabled ? v.amountWhole : '',
            vestDuration: v.enabled ? v.durationDays : '',
            vestCliff: v.enabled ? v.cliffDays : '',
          },
        });
      },
      onError: (err) => {
        setLaunchError(mapLaunchError(err));
      },
    });
  }, [validateStep, buildLaunchPayload, launch, router, draft.symbol, v]);

  // Map the documented §d.1 launch error codes to actionable copy.
  function mapLaunchError(err: any): string {
    const status = err?.status as number | undefined;
    const raw = err?.message as string | undefined;
    if (status === 202) {
      // Broadcast-but-unconfirmed (TIMEOUT / BLOCKHASH_EXPIRED). The launch may
      // still land on-chain; the backend dedups a re-broadcast, so RETRY is safe
      // but the outcome is not yet known. Do NOT claim the token is live.
      return 'Your launch was submitted but is still confirming on-chain. It may already have landed — wait a moment, then check your profile before retrying.';
    }
    if (status === 409) {
      return 'You already have a token. Each creator can launch only one token.';
    }
    if (status === 402) {
      return 'Insufficient funds to cover the launch. Top up your wallet and try again.';
    }
    if (status === 400) {
      return raw || 'The launch simulation failed. Review your parameters and try again.';
    }
    return raw || 'Could not launch your token. Please try again.';
  }

  const edit = (step: string) =>
    router.push((step === 'basics' ? '/launch' : `/launch/${step}`) as any);

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <Text variant="label" style={styles.groupLabel}>
            BASICS
          </Text>
          <ReviewRow label="NAME" value={draft.name || '—'} onEdit={() => edit('basics')} />
          <ReviewRow label="SYMBOL" value={`$${draft.symbol || '—'}`} onEdit={() => edit('basics')} />
          <ReviewRow label="SUPPLY" value={Number(draft.totalSupply || '0').toLocaleString()} onEdit={() => edit('basics')} />
          <ReviewRow label="DECIMALS" value={String(draft.decimals)} onEdit={() => edit('basics')} />
        </Card>

        <Card style={styles.card}>
          <Text variant="label" style={styles.groupLabel}>
            FEES
          </Text>
          <ReviewRow label="TRANSFER FEE" value={bpsToPct(draft.transferFeeBps)} onEdit={() => edit('fees')} />
          <ReviewRow label="CREATOR SHARE" value={bpsToPct(draft.creatorBps)} onEdit={() => edit('fees')} />
          <ReviewRow label="MOMENTO SHARE" value={bpsToPct(draft.partnerBps)} onEdit={() => edit('fees')} />
        </Card>

        <Card style={styles.card}>
          <Text variant="label" style={styles.groupLabel}>
            FUNDRAISE
          </Text>
          <ReviewRow label="TARGET" value={`$${Number(draft.targetUsd || '0').toLocaleString()}`} onEdit={() => edit('fundraise')} />
          {draft.initialMarketCapUsd ? (
            <ReviewRow label="START MCAP" value={`$${Number(draft.initialMarketCapUsd).toLocaleString()}`} onEdit={() => edit('fundraise')} />
          ) : null}
          <ReviewRow label="CREATOR LOCKED LP" value={`${draft.creatorLockedLpPct}%`} onEdit={() => edit('fundraise')} />
          <ReviewRow label="CREATOR LP" value={`${draft.creatorLpPct}%`} onEdit={() => edit('fundraise')} />
          <ReviewRow label="PARTNER LOCKED LP" value={`${draft.partnerLockedLpPct}%`} onEdit={() => edit('fundraise')} />
          <ReviewRow label="PARTNER LP" value={`${draft.partnerLpPct}%`} onEdit={() => edit('fundraise')} />
        </Card>

        <Card style={styles.card}>
          <Text variant="label" style={styles.groupLabel}>
            VESTING
          </Text>
          {v.enabled ? (
            <>
              <ReviewRow label="AMOUNT" value={`${Number(v.amountWhole || '0').toLocaleString()} $${draft.symbol}`} onEdit={() => edit('vesting')} />
              <ReviewRow label="DURATION" value={`${v.durationDays} days`} onEdit={() => edit('vesting')} />
              <ReviewRow label="CLIFF" value={`${v.cliffDays} days`} onEdit={() => edit('vesting')} />
            </>
          ) : (
            <ReviewRow label="VESTING" value="None" onEdit={() => edit('vesting')} />
          )}
        </Card>

        <FeeDisclosure variant="launch" display="card" transferFeeBps={draft.transferFeeBps} style={styles.disclosure} />

        {/* Disclaimer acceptance */}
        <Pressable
          onPress={() => setAccepted((a) => !a)}
          style={styles.acceptRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
            {accepted ? <Ionicons name="checkmark" size={14} color={COLORS.background} /> : null}
          </View>
          <Text variant="caption" style={styles.acceptText}>
            I understand launching is permanent, the token parameters cannot be
            changed, and this is not financial or tax advice.
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        {launchError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            <Text variant="caption" style={styles.errorBannerText}>
              {launchError}
            </Text>
          </View>
        ) : null}
        <Button
          label={launch.isPending ? 'LAUNCHING…' : launchError ? 'RETRY LAUNCH' : 'LAUNCH TOKEN'}
          fullWidth
          loading={launch.isPending}
          disabled={!accepted || !valuesValid || launch.isPending}
          onPress={handleLaunch}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  card: {
    padding: SPACING.lg,
  },
  groupLabel: {
    color: COLORS.primary,
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
  disclosure: {
    marginTop: SPACING.xs,
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  acceptText: {
    flex: 1,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.error,
    textTransform: 'none',
    lineHeight: 16,
  },
});
