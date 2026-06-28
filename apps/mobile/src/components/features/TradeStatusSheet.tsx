import React from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { CHAIN_CONFIG } from '@momento/shared';
import type { SignStatus } from '@/hooks/useClientSignSubmit';

export interface TradeStatusSheetProps {
  visible: boolean;
  status: SignStatus;
  error: string | null;
  signature: string | null;
  symbol: string;
  /**
   * Chain-confirmation status from /submit. 'PENDING' means accepted but NOT yet
   * confirmed — we must NOT claim "CONFIRMED" for it. null/'CONFIRMED' = settled.
   */
  submitStatus?: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const explorerBase = CHAIN_CONFIG.solana.explorerUrl;
const explorerName = CHAIN_CONFIG.solana.explorerName;

const PROGRESS_COPY: Record<string, { title: string; subtitle: string }> = {
  signing: {
    title: 'SIGN TRANSACTION',
    subtitle: 'Approve the trade in your embedded wallet…',
  },
  submitting: {
    title: 'SUBMITTING',
    subtitle: 'Relaying your signed transaction to Momento…',
  },
  confirming: {
    title: `CONFIRMING ON ${CHAIN_CONFIG.solana.name.toUpperCase()}`,
    subtitle: 'Waiting for block confirmation…',
  },
};

/**
 * Full-screen overlay covering the client-sign → /submit → confirm lifecycle of
 * a trade. Drives off the shared `SignStatus`:
 *  - signing / submitting / confirming → busy spinner (non-dismissable)
 *  - success → green check + explorer link
 *  - error   → red alert + RETRY / CLOSE
 *
 * Mirrors SwapModal's status/result screens for design parity.
 */
export function TradeStatusSheet({
  visible,
  status,
  error,
  signature,
  symbol,
  submitStatus,
  onRetry,
  onClose,
}: TradeStatusSheetProps) {
  const insets = useSafeAreaInsets();

  const isBusy = status === 'signing' || status === 'submitting' || status === 'confirming';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  // PENDING = relayed but NOT yet confirmed on chain. Never show a green
  // "CONFIRMED" check for it — surface a distinct "submitted, confirming" state.
  const isPending = isSuccess && submitStatus === 'PENDING';

  // While busy the sheet is non-dismissable; success/error allow close.
  const handleRequestClose = () => {
    if (!isBusy) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: SPACING.xl + insets.bottom },
          ]}
        >
          {isBusy && (
            <View style={styles.body}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text variant="h3" style={styles.title}>
                {PROGRESS_COPY[status]?.title ?? 'PROCESSING'}
              </Text>
              <Text variant="caption" style={styles.subtitle}>
                {PROGRESS_COPY[status]?.subtitle ?? ''}
              </Text>
            </View>
          )}

          {isSuccess && (
            <View style={styles.body}>
              {isPending ? (
                <View style={styles.pendingCircle}>
                  <Ionicons name="time-outline" size={40} color={COLORS.primary} />
                </View>
              ) : (
                <View style={styles.successCircle}>
                  <Ionicons name="checkmark" size={40} color={COLORS.background} />
                </View>
              )}
              <Text variant="h3" style={styles.title}>
                {isPending ? 'SUBMITTED' : 'TRADE CONFIRMED'}
              </Text>
              <Text variant="caption" style={styles.subtitle}>
                {isPending
                  ? `Your $${symbol} order was relayed and is confirming on-chain. Balances will reconcile once it lands — check the explorer for status.`
                  : `Your $${symbol} order has been confirmed. Balances update shortly.`}
              </Text>

              {signature && (
                <Pressable
                  style={styles.sigCard}
                  onPress={() => Linking.openURL(`${explorerBase}/tx/${signature}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`View transaction on ${explorerName}`}
                >
                  <View style={styles.sigRow}>
                    <Text variant="caption" style={styles.sigValue} numberOfLines={1}>
                      {signature}
                    </Text>
                    <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                  </View>
                  <Text variant="caption" style={styles.sigHint}>
                    View on {explorerName}
                  </Text>
                </Pressable>
              )}

              <Pressable style={styles.primaryBtn} onPress={onClose}>
                <Text variant="body" style={styles.primaryBtnText}>
                  DONE
                </Text>
              </Pressable>
            </View>
          )}

          {isError && (
            <View style={styles.body}>
              <View style={styles.errorCircle}>
                <Ionicons name="alert-circle" size={40} color={COLORS.error} />
              </View>
              <Text variant="h3" style={styles.title}>
                TRADE FAILED
              </Text>
              <Text variant="caption" style={styles.errorText}>
                {error || 'Something went wrong. Please try again.'}
              </Text>

              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryBtn} onPress={onClose}>
                  <Text variant="body" style={styles.secondaryBtnText}>
                    CLOSE
                  </Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={onRetry}>
                  <Text variant="body" style={styles.primaryBtnText}>
                    RETRY
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  body: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  title: {
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    textTransform: 'none',
    lineHeight: 18,
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
  pendingCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryMuted,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    textTransform: 'none',
    lineHeight: 18,
  },
  sigCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    width: '100%',
    marginTop: SPACING.xs,
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
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  primaryBtnText: {
    color: COLORS.textInverse,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  secondaryBtnText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 15,
  },
});
