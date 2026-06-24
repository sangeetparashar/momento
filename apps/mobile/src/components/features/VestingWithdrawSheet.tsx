import React, { useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button } from '@/components/primitives';
import { FeeDisclosure } from '@/components/composites';
import { useWithdrawVesting } from '@/hooks';
import { formatBaseUnits } from '@/utils/tokenAmount';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { CHAIN_CONFIG } from '@momento/shared';
import type { VestingListItem } from '@/services/tokenApi.types';

export interface VestingWithdrawSheetProps {
  visible: boolean;
  schedule: VestingListItem | null;
  onClose: () => void;
}

const DEFAULT_DECIMALS = 9;
const explorerBase = CHAIN_CONFIG.solana.explorerUrl;
const explorerName = CHAIN_CONFIG.solana.explorerName;

/**
 * Recipient-only withdraw sheet (page-sheet modal, SwapModal shell).
 *
 * Review → `useWithdrawVesting().withdraw(id)`: POST /vesting/[id]/withdraw
 * returns ONLY an unsigned tx (NO submit endpoint, §d.9) → the shared sign hook
 * `signAndSend`s it (provider broadcasts, exactly like useSwap) → confirming →
 * success (explorer link, DONE invalidates ['vesting']) / error (TRY AGAIN).
 *
 * The sheet is non-dismissable while signing/confirming so the user can't
 * abandon an in-flight on-chain action. Status resets when reopened.
 */
export function VestingWithdrawSheet({
  visible,
  schedule,
  onClose,
}: VestingWithdrawSheetProps) {
  const insets = useSafeAreaInsets();
  const { withdraw, status, error, reset } = useWithdrawVesting();

  // Build-tx errors (e.g. 400 "Nothing to withdraw", 403 not-recipient) are
  // thrown before the signer runs, so capture them locally.
  const [buildError, setBuildError] = React.useState<string | null>(null);

  // Fresh state each time the sheet opens.
  useEffect(() => {
    if (visible) {
      reset();
      setBuildError(null);
    }
  }, [visible, reset]);

  const decimals = schedule?.decimals ?? DEFAULT_DECIMALS;
  const symbol = schedule?.symbol ?? 'TOKEN';
  const claimableDisplay = schedule
    ? formatBaseUnits(schedule.claimableBase, decimals, 6)
    : '0';

  // Gate the CTA when there's nothing to withdraw (also catches a list row that
  // went to 0 between fetch and open). Prevents a deterministic backend 400.
  let nothingToWithdraw = false;
  try {
    nothingToWithdraw = !schedule || BigInt(schedule.claimableBase || '0') <= 0n;
  } catch {
    nothingToWithdraw = true;
  }

  const effectiveError = buildError ?? error;
  const isBusy =
    status === 'signing' || status === 'submitting' || status === 'confirming';
  const isSuccess = status === 'success';
  const isError = status === 'error' || buildError != null;
  // Review state holds only while idle AND no build-tx error is pending.
  const isReview = status === 'idle' && buildError == null;

  // Classify the backend error so we can show a non-alarming / terminal message.
  const lowerErr = (effectiveError ?? '').toLowerCase();
  const isNothingErr = lowerErr.includes('nothing to withdraw');
  const isNotRecipientErr =
    lowerErr.includes('not the recipient') ||
    lowerErr.includes('beneficiary') ||
    lowerErr.includes('forbidden') ||
    lowerErr.includes('403');

  // Read the signature the hook captured (success path).
  const [signature, setSignature] = React.useState<string | null>(null);

  const handleWithdraw = useCallback(async () => {
    if (!schedule) return;
    setBuildError(null);
    try {
      const res = await withdraw(schedule.vestingId);
      if (res?.signature) setSignature(res.signature);
    } catch (err: any) {
      setBuildError(err?.message ?? 'Withdraw failed');
    }
  }, [schedule, withdraw]);

  // Block close while an on-chain action is in flight.
  const handleRequestClose = useCallback(() => {
    if (!isBusy) onClose();
  }, [isBusy, onClose]);

  const handleDone = useCallback(() => {
    setSignature(null);
    onClose();
  }, [onClose]);

  const recipientShort = schedule
    ? `${schedule.mint.slice(0, 4)}…${schedule.mint.slice(-4)}`
    : '—';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: SPACING.lg }]}>
          <Text variant="h3" style={styles.headerTitle}>
            WITHDRAW
          </Text>
          <Pressable
            onPress={handleRequestClose}
            disabled={isBusy}
            hitSlop={8}
            style={isBusy && styles.disabledClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons
              name="close"
              size={24}
              color={isBusy ? COLORS.textTertiary : COLORS.textPrimary}
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: SPACING.xl + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* REVIEW */}
          {isReview && schedule && (
            <>
              <View style={styles.amountBlock}>
                <Text variant="label" style={styles.amountLabel}>
                  YOU RECEIVE (GROSS)
                </Text>
                <Text variant="monoLarge" style={styles.amountValue}>
                  {claimableDisplay}
                </Text>
                <Text variant="caption" style={styles.amountSymbol}>
                  ${symbol}
                </Text>
              </View>

              <View style={styles.reviewCard}>
                <ReviewRow label="TOKEN" value={`$${symbol}`} />
                <ReviewRow label="MINT" value={recipientShort} mono />
                <ReviewRow
                  label="CLAIMABLE"
                  value={`${claimableDisplay} ${symbol}`}
                />
              </View>

              <FeeDisclosure
                variant="vesting"
                display="card"
                symbol={symbol}
                style={styles.disclosure}
              />

              {effectiveError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                  <Text variant="caption" style={styles.errorBannerText}>
                    {effectiveError}
                  </Text>
                </View>
              ) : null}

              <Button
                label={nothingToWithdraw ? 'NOTHING TO WITHDRAW YET' : `WITHDRAW $${symbol}`}
                fullWidth
                disabled={nothingToWithdraw}
                onPress={handleWithdraw}
                style={styles.cta}
              />
            </>
          )}

          {/* BUSY */}
          {isBusy && (
            <View style={styles.statusBlock}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text variant="h3" style={styles.statusTitle}>
                {STATUS_COPY[status]?.title ?? 'PROCESSING'}
              </Text>
              <Text variant="caption" style={styles.statusSubtitle}>
                {STATUS_COPY[status]?.subtitle ?? ''}
              </Text>
            </View>
          )}

          {/* SUCCESS */}
          {isSuccess && (
            <View style={styles.statusBlock}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={40} color={COLORS.background} />
              </View>
              <Text variant="h3" style={styles.statusTitle}>
                WITHDRAWN
              </Text>
              <Text variant="caption" style={styles.statusSubtitle}>
                Your ${symbol} has been released. Balances update shortly.
              </Text>

              {signature ? (
                <Pressable
                  style={styles.sigCard}
                  onPress={() =>
                    Linking.openURL(`${explorerBase}/tx/${signature}`)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`View transaction on ${explorerName}`}
                >
                  <View style={styles.sigRow}>
                    <Text
                      variant="caption"
                      style={styles.sigValue}
                      numberOfLines={1}
                    >
                      {signature}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                  </View>
                  <Text variant="caption" style={styles.sigHint}>
                    View on {explorerName}
                  </Text>
                </Pressable>
              ) : null}

              <Button label="DONE" fullWidth onPress={handleDone} style={styles.cta} />
            </View>
          )}

          {/* ERROR */}
          {isError && (
            <View style={styles.statusBlock}>
              {isNothingErr || isNotRecipientErr ? (
                <View style={styles.infoCircle}>
                  <Ionicons
                    name={isNotRecipientErr ? 'person-outline' : 'time-outline'}
                    size={40}
                    color={COLORS.textSecondary}
                  />
                </View>
              ) : (
                <View style={styles.errorCircle}>
                  <Ionicons name="alert-circle" size={40} color={COLORS.error} />
                </View>
              )}
              <Text variant="h3" style={styles.statusTitle}>
                {isNotRecipientErr
                  ? 'NOT THE RECIPIENT'
                  : isNothingErr
                    ? 'NOTHING TO WITHDRAW'
                    : 'WITHDRAW FAILED'}
              </Text>
              <Text
                variant="caption"
                style={isNothingErr || isNotRecipientErr ? styles.statusSubtitle : styles.statusError}
              >
                {isNotRecipientErr
                  ? 'This vesting schedule can only be withdrawn by its recipient wallet.'
                  : isNothingErr
                    ? 'There is nothing claimable right now. Check back after the next unlock.'
                    : effectiveError || 'Something went wrong. Please try again.'}
              </Text>

              {/* Recoverable errors offer RETRY; terminal ones (403 / nothing) only CLOSE. */}
              {isNotRecipientErr || isNothingErr ? (
                <Button label="CLOSE" fullWidth onPress={handleDone} style={styles.cta} />
              ) : (
                <View style={styles.actionRow}>
                  <Button
                    label="CLOSE"
                    variant="secondary"
                    onPress={handleDone}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="TRY AGAIN"
                    onPress={handleWithdraw}
                    style={styles.actionBtn}
                  />
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const STATUS_COPY: Record<string, { title: string; subtitle: string }> = {
  signing: {
    title: 'SIGN TRANSACTION',
    subtitle: 'Approve the withdrawal in your embedded wallet…',
  },
  submitting: {
    title: 'SUBMITTING',
    subtitle: 'Broadcasting your transaction…',
  },
  confirming: {
    title: `CONFIRMING ON ${CHAIN_CONFIG.solana.name.toUpperCase()}`,
    subtitle: 'Waiting for block confirmation…',
  },
};

function ReviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text variant="label" style={styles.reviewLabel}>
        {label}
      </Text>
      <Text
        variant={mono ? 'mono' : 'body'}
        style={styles.reviewValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary,
  },
  disabledClose: {
    opacity: 0.4,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  amountBlock: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  amountLabel: {
    color: COLORS.textTertiary,
  },
  amountValue: {
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  amountSymbol: {
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  reviewLabel: {
    color: COLORS.textSecondary,
  },
  reviewValue: {
    color: COLORS.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: SPACING.md,
  },
  disclosure: {
    marginTop: SPACING.xs,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.error,
    textTransform: 'none',
  },
  cta: {
    marginTop: SPACING.sm,
  },
  statusBlock: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.xxl,
  },
  statusTitle: {
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  statusSubtitle: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    textTransform: 'none',
    lineHeight: 18,
    paddingHorizontal: SPACING.lg,
  },
  statusError: {
    color: COLORS.error,
    textAlign: 'center',
    textTransform: 'none',
    lineHeight: 18,
    paddingHorizontal: SPACING.lg,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sigCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    width: '100%',
  },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sigValue: {
    flex: 1,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    textTransform: 'none',
  },
  sigHint: {
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
    marginTop: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
