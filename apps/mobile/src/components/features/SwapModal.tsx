import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSwap, TOKEN_MINTS } from '@/hooks/useSwap';
import { useAuth } from '@/hooks/useAuth';
import { useChain } from '@/hooks/useChain';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import { CHAIN_CONFIG } from '@momento/shared';
import type { ChainType } from '@momento/shared';

const TX_STORAGE_KEY_BASE = 'momento_recent_txs';
const MAX_TX_RECORDS = 20;

/** Per-user, per-chain tx storage key — must match wallet.tsx getTxStorageKey */
function getTxStorageKey(userId: string | undefined, chain: ChainType): string {
  if (!userId) return `${TX_STORAGE_KEY_BASE}:${chain}`;
  return `${TX_STORAGE_KEY_BASE}:${userId}:${chain}`;
}

/** Native ETH placeholder address used by KyberSwap/0x */
const ETH_NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

interface SwapModalProps {
  visible: boolean;
  onClose: () => void;
}

/** SOL has 9 decimals, USDC has 6 */
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

/** Minimum swap amounts (per native symbol) */
const MIN_SWAP: Record<string, number> = { SOL: 0.01, ETH: 0.001, USDC: 1 };
/** Minimum native balance required in wallet for transaction fees */
const MIN_NATIVE_FOR_FEES: Record<'solana' | 'base', number> = {
  solana: 0.005,
  base: 0.0002,
};

interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  icon: string;
}

const SOLANA_TOKENS: TokenInfo[] = [
  { symbol: 'SOL', mint: TOKEN_MINTS.SOL, decimals: SOL_DECIMALS, icon: '◎' },
  { symbol: 'USDC', mint: TOKEN_MINTS.USDC, decimals: USDC_DECIMALS, icon: '$' },
];

const BASE_TOKENS: TokenInfo[] = [
  { symbol: 'ETH', mint: ETH_NATIVE, decimals: 18, icon: 'Ξ' },
  { symbol: 'USDC', mint: CHAIN_CONFIG.base.usdcAddress, decimals: USDC_DECIMALS, icon: '$' },
];

/**
 * Native in-app swap modal powered by Jupiter + Privy wallet signing.
 *
 * Flow: user enters amount → fetches quote from Jupiter (with 4% platform fee)
 * → reviews output amount → signs transaction with Privy embedded wallet.
 */
export function SwapModal({ visible, onClose }: SwapModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { walletAddress } = auth;
  const { chain } = useChain();
  const { user: profile } = useUserProfile();
  const { quote, status, error, fetchQuote, executeSwap, reset } = useSwap();
  const balanceQuery = useWalletBalance(visible);

  const tokens = chain === 'base' ? BASE_TOKENS : SOLANA_TOKENS;
  const nativeSymbol = CHAIN_CONFIG[chain].symbol;
  const explorerBase = CHAIN_CONFIG[chain].explorerUrl;
  const explorerName = CHAIN_CONFIG[chain].explorerName;

  const [inputToken, setInputToken] = useState<TokenInfo>(tokens[0]);
  const [outputToken, setOutputToken] = useState<TokenInfo>(tokens[1]);
  const [inputAmount, setInputAmount] = useState('');
  const [quoteTimer, setQuoteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  // Success/error result state (replaces Alert.alert)
  const [swapResult, setSwapResult] = useState<{
    type: 'success' | 'error';
    signature?: string;
    message?: string;
  } | null>(null);

  // Get available balance for the input token (chain-aware)
  const availableBalance = (() => {
    if (!balanceQuery.data) return null;
    const balanceData: any = balanceQuery.data;
    const isNative = inputToken.symbol === nativeSymbol;
    if (isNative) {
      // Reserve a small buffer of native token for fees
      const raw =
        balanceData.nativeBalance ??
        (chain === 'solana' ? balanceData.solBalance : 0) ??
        0;
      const buffer = chain === 'base' ? 0.0002 : 0.01;
      return Math.max(0, raw - buffer);
    }
    const tokenHolding = balanceData.tokens?.find(
      (t: any) =>
        t.mint === inputToken.mint ||
        t.address?.toLowerCase?.() === inputToken.mint.toLowerCase(),
    );
    return tokenHolding?.amount ?? 0;
  })();

  const handleMax = useCallback(() => {
    if (availableBalance != null && availableBalance > 0) {
      const precision = inputToken.symbol === nativeSymbol ? 4 : 2;
      setInputAmount(availableBalance.toFixed(precision));
    }
  }, [availableBalance, inputToken, nativeSymbol]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setInputAmount('');
      setSwapResult(null);
      reset();
      if (quoteTimer) clearTimeout(quoteTimer);
    }
  }, [visible]);

  // Reset state and tokens when chain changes
  useEffect(() => {
    setInputToken(tokens[0]);
    setOutputToken(tokens[1]);
    setInputAmount('');
    setSwapResult(null);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  // Auto-fetch quote with debounce when amount changes
  useEffect(() => {
    if (quoteTimer) clearTimeout(quoteTimer);

    const numericAmount = parseFloat(inputAmount);
    if (!inputAmount || isNaN(numericAmount) || numericAmount <= 0) {
      return;
    }

    const lamports = Math.floor(numericAmount * 10 ** inputToken.decimals).toString();

    const timer = setTimeout(() => {
      fetchQuote({
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount: lamports,
      });
    }, 500);

    setQuoteTimer(timer);
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken, outputToken]);

  const handleFlipTokens = useCallback(() => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount('');
    setSwapResult(null);
    reset();
  }, [inputToken, outputToken, reset]);

  const handleSwap = useCallback(async () => {
    if (!walletAddress) return;
    setSwapResult(null);

    const signature = await executeSwap();
    if (signature) {
      setSwapResult({ type: 'success', signature });
      // Force immediate balance refetch (not just invalidate — actually refetch)
      queryClient.refetchQueries({ queryKey: ['walletBalance'] });
      // Refetch again after on-chain finality (3s + 8s)
      setTimeout(() => queryClient.refetchQueries({ queryKey: ['walletBalance'] }), 3000);
      setTimeout(() => queryClient.refetchQueries({ queryKey: ['walletBalance'] }), 8000);

      // Persist tx record for wallet history
      try {
        const txKey = getTxStorageKey(profile?.id, chain);
        const raw = await AsyncStorage.getItem(txKey);
        const existing = raw ? JSON.parse(raw) : [];
        const record = {
          signature,
          type: 'swap' as const,
          label: `${inputAmount} ${inputToken.symbol} → ${outputAmount ?? '?'} ${outputToken.symbol}`,
          timestamp: Date.now(),
        };
        const updated = [record, ...existing].slice(0, MAX_TX_RECORDS);
        await AsyncStorage.setItem(txKey, JSON.stringify(updated));
      } catch {
        // non-critical — don't block success flow
      }
    } else {
      // error state is already set by useSwap hook
    }
  }, [walletAddress, executeSwap, queryClient]);

  const handleClose = useCallback(() => {
    if (status === 'signing' || status === 'sending') return;
    onClose();
  }, [status, onClose]);

  const handleDone = useCallback(() => {
    // Invalidate balance one more time on close
    queryClient.invalidateQueries({ queryKey: ['walletBalance'] });
    onClose();
  }, [queryClient, onClose]);

  const handleSwapAgain = useCallback(() => {
    setInputAmount('');
    setSwapResult(null);
    reset();
  }, [reset]);

  const outputAmount = quote
    ? (parseInt(quote.outAmount, 10) / 10 ** outputToken.decimals).toFixed(
        outputToken.decimals === 6 ? 2 : 4
      )
    : null;

  const priceImpact = quote ? parseFloat(quote.priceImpactPct) : 0;
  const platformFeeAmount = quote?.platformFee
    ? (parseInt(quote.platformFee.amount, 10) / 10 ** outputToken.decimals).toFixed(
        outputToken.decimals === 6 ? 2 : 4
      )
    : null;

  const isQuoting = status === 'quoting';
  const isBusy =
    status === 'approving' ||
    status === 'signing' ||
    status === 'sending' ||
    status === 'confirming';
  const inputNum = parseFloat(inputAmount) || 0;
  const insufficientBalance = availableBalance != null && inputNum > availableBalance;
  const isBalanceLoading = balanceQuery.isLoading || !balanceQuery.data;

  // Minimum swap validation
  const minSwap = MIN_SWAP[inputToken.symbol] ?? 0;
  const belowMinimum = inputNum > 0 && inputNum < minSwap;

  // Check if user has enough native token for transaction fees
  const balanceData: any = balanceQuery.data;
  const nativeBalance =
    balanceData?.nativeBalance ??
    (chain === 'solana' ? balanceData?.solBalance : 0) ??
    0;
  const minNativeForFees = MIN_NATIVE_FOR_FEES[chain];
  const insufficientFees = balanceQuery.data != null && nativeBalance < minNativeForFees;

  const canSwap = quote && !isBusy && !isQuoting && inputNum > 0 && !insufficientBalance && !belowMinimum && !insufficientFees;

  // ─── Success screen ───
  if (swapResult?.type === 'success') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDone}
      >
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.resultContainer}>
            <View style={styles.successCircle}>
              <Ionicons name="checkmark" size={48} color={COLORS.background} />
            </View>
            <Text style={styles.resultTitle}>Swap Successful</Text>
            <Text style={styles.resultSubtitle}>
              {inputAmount} {inputToken.symbol} → {outputAmount} {outputToken.symbol}
            </Text>

            {swapResult.signature && (
              <Pressable
                style={styles.signatureCard}
                onPress={() => Linking.openURL(`${explorerBase}/tx/${swapResult.signature}`)}
              >
                <Text style={styles.signatureLabel}>Transaction Signature</Text>
                <View style={styles.signatureRow}>
                  <Text style={styles.signatureValue} numberOfLines={1}>
                    {swapResult.signature}
                  </Text>
                  <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                </View>
                <Text style={styles.signatureHint}>Tap to view on {explorerName}</Text>
              </Pressable>
            )}

            <Text style={styles.resultHint}>
              Your wallet balance will update momentarily.
            </Text>

            <View style={styles.resultActions}>
              <Pressable onPress={handleSwapAgain} style={styles.secondaryButton}>
                <Ionicons name="swap-vertical" size={18} color={COLORS.primary} />
                <Text style={styles.secondaryButtonText}>Swap Again</Text>
              </Pressable>
              <Pressable onPress={handleDone} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Swap</Text>
            <Text style={styles.headerSubtitle}>
              {chain === 'base' ? 'Powered by KyberSwap' : 'Powered by Jupiter'}
            </Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
        >
          {/* Skeleton loading state until balance data is ready */}
          {isBalanceLoading ? (
            <View style={styles.skeletonContainer}>
              <View style={styles.skeletonCard}>
                <View style={styles.skeletonLabelRow}>
                  <View style={[styles.skeletonBlock, { width: 60, height: 12 }]} />
                  <View style={[styles.skeletonBlock, { width: 100, height: 12 }]} />
                </View>
                <View style={styles.skeletonTokenRow}>
                  <View style={[styles.skeletonBlock, { width: 80, height: 36, borderRadius: 18 }]} />
                  <View style={[styles.skeletonBlock, { width: 100, height: 28 }]} />
                </View>
              </View>
              <View style={styles.flipContainer}>
                <View style={[styles.flipButton, { opacity: 0.3 }]}>
                  <Ionicons name="swap-vertical" size={20} color={COLORS.primary} />
                </View>
              </View>
              <View style={styles.skeletonCard}>
                <View style={styles.skeletonLabelRow}>
                  <View style={[styles.skeletonBlock, { width: 80, height: 12 }]} />
                </View>
                <View style={styles.skeletonTokenRow}>
                  <View style={[styles.skeletonBlock, { width: 80, height: 36, borderRadius: 18 }]} />
                  <View style={[styles.skeletonBlock, { width: 80, height: 28 }]} />
                </View>
              </View>
              <View style={[styles.skeletonBlock, { width: '100%', height: 52, borderRadius: RADII.md, marginTop: SPACING.lg }]} />
              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark" size={14} color={COLORS.textTertiary} />
                <Text style={styles.infoText}>
                  Loading your wallet balances...
                </Text>
              </View>
            </View>
          ) : (
          <>
          {/* Input Token */}
          <View style={styles.tokenCard}>
            <View style={styles.tokenLabelRow}>
              <Text style={styles.tokenLabel}>You pay</Text>
              {availableBalance != null && (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceText}>
                    Balance: {inputToken.symbol === 'SOL'
                      ? availableBalance.toFixed(4)
                      : availableBalance.toFixed(2)} {inputToken.symbol}
                  </Text>
                  <Pressable onPress={handleMax} hitSlop={8} style={styles.maxButton}>
                    <Text style={styles.maxButtonText}>MAX</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.tokenRow}>
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenIcon}>{inputToken.icon}</Text>
                <Text style={styles.tokenSymbol}>{inputToken.symbol}</Text>
              </View>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
                value={inputAmount}
                onChangeText={setInputAmount}
                editable={!isBusy}
              />
            </View>
          </View>

          {/* Flip Button */}
          <View style={styles.flipContainer}>
            <Pressable onPress={handleFlipTokens} style={styles.flipButton} disabled={isBusy}>
              <Ionicons name="swap-vertical" size={20} color={COLORS.primary} />
            </Pressable>
          </View>

          {/* Output Token */}
          <View style={styles.tokenCard}>
            <Text style={styles.tokenLabel}>You receive</Text>
            <View style={styles.tokenRow}>
              <View style={styles.tokenBadge}>
                <Text style={styles.tokenIcon}>{outputToken.icon}</Text>
                <Text style={styles.tokenSymbol}>{outputToken.symbol}</Text>
              </View>
              <View style={styles.outputAmountContainer}>
                {isQuoting ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.outputAmount}>
                    {outputAmount || '0.00'}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Quote Details */}
          {quote && (
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Price impact</Text>
                <Text
                  style={[
                    styles.detailValue,
                    priceImpact > 1 && styles.detailValueWarning,
                  ]}
                >
                  {priceImpact < 0.01 ? '<0.01' : priceImpact.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Min. received</Text>
                <Text style={styles.detailValue}>
                  {(
                    parseInt(quote.otherAmountThreshold, 10) /
                    10 ** outputToken.decimals
                  ).toFixed(outputToken.decimals === 6 ? 2 : 4)}{' '}
                  {outputToken.symbol}
                </Text>
              </View>
            </View>
          )}

          {/* Transaction progress */}
          {isBusy && (
            <View style={styles.progressCard}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.progressTitle}>
                {status === 'approving'
                  ? 'Approving Token'
                  : status === 'signing'
                  ? 'Signing Transaction'
                  : status === 'sending'
                  ? 'Sending Transaction'
                  : `Confirming on ${CHAIN_CONFIG[chain].name}`}
              </Text>
              <Text style={styles.progressSubtitle}>
                {status === 'approving'
                  ? 'Granting swap router permission to spend your token...'
                  : status === 'signing'
                  ? 'Approve the transaction in your wallet...'
                  : status === 'sending'
                  ? `Broadcasting to the ${CHAIN_CONFIG[chain].name} network...`
                  : 'Waiting for block confirmation...'}
              </Text>
            </View>
          )}

          {/* Error */}
          {error && !isBusy && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={COLORS.error} />
              <View style={styles.errorContent}>
                <Text style={styles.errorTitle}>Swap Failed</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </View>
          )}

          {/* Swap Button */}
          {!isBusy && (
            <Pressable
              style={[styles.swapButton, !canSwap && styles.swapButtonDisabled]}
              onPress={handleSwap}
              disabled={!canSwap}
            >
              <Text style={styles.swapButtonText}>
                {!walletAddress
                  ? 'Connect Wallet'
                  : !inputAmount || inputNum <= 0
                  ? 'Enter Amount'
                  : belowMinimum
                  ? `Min ${minSwap} ${inputToken.symbol}`
                  : insufficientFees
                  ? `Need ${minNativeForFees} ${nativeSymbol} for fees`
                  : insufficientBalance
                  ? `Insufficient ${inputToken.symbol}`
                  : isQuoting
                  ? 'Fetching Quote...'
                  : 'Swap'}
              </Text>
            </Pressable>
          )}

          {/* Info */}
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.textTertiary} />
            <Text style={styles.infoText}>
              {chain === 'base'
                ? 'Network fees on Base are typically <$0.01. Transactions are signed locally with your embedded wallet.'
                : 'Transactions are signed locally with your embedded wallet. Momento never has access to your private keys.'}
            </Text>
          </View>
          </>
          )}
        </ScrollView>
      </View>
    </Modal>
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADII.full,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  tokenCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tokenLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  tokenLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  balanceText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  maxButton: {
    backgroundColor: COLORS.primaryMuted,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  maxButtonText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 10,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundTertiary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    gap: SPACING.xs,
  },
  tokenIcon: {
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  tokenSymbol: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  amountInput: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.md,
    padding: 0,
  },
  outputAmountContainer: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: SPACING.md,
  },
  outputAmount: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  flipContainer: {
    alignItems: 'center',
    marginVertical: -SPACING.sm,
    zIndex: 1,
  },
  flipButton: {
    width: 36,
    height: 36,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  detailValueWarning: {
    color: COLORS.warning,
  },

  // Transaction progress
  progressCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    gap: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
  },
  progressTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  progressSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.2)',
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.error,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.error,
    opacity: 0.8,
  },

  // Swap button
  swapButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  swapButtonDisabled: {
    opacity: 0.4,
  },
  swapButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textInverse,
    fontWeight: '700',
    fontSize: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  infoText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  // ─── Skeleton loading ───
  skeletonContainer: {
    gap: SPACING.sm,
  },
  skeletonCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  skeletonLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  skeletonTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeletonBlock: {
    backgroundColor: COLORS.backgroundTertiary,
    borderRadius: RADII.sm,
    opacity: 0.6,
  },

  // ─── Success screen ───
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  resultTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  resultSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  signatureCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  signatureLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginBottom: SPACING.xs,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signatureValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  signatureHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontSize: 10,
    marginTop: SPACING.xs,
  },
  resultHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    marginBottom: SPACING.xl,
  },
  resultActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  secondaryButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADII.md,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textInverse,
    fontWeight: '700',
    fontSize: 15,
  },
});
