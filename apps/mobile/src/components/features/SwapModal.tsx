import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { useSwap, TOKEN_MINTS } from '@/hooks/useSwap';
import { useAuth } from '@/hooks/useAuth';

interface SwapModalProps {
  visible: boolean;
  onClose: () => void;
}

/** SOL has 9 decimals, USDC has 6 */
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  icon: string;
}

const TOKENS: TokenInfo[] = [
  { symbol: 'SOL', mint: TOKEN_MINTS.SOL, decimals: SOL_DECIMALS, icon: '◎' },
  { symbol: 'USDC', mint: TOKEN_MINTS.USDC, decimals: USDC_DECIMALS, icon: '$' },
];

/**
 * Native in-app swap modal powered by Jupiter + Privy wallet signing.
 *
 * Flow: user enters amount → fetches quote from Jupiter (with 4% platform fee)
 * → reviews output amount → signs transaction with Privy embedded wallet.
 */
export function SwapModal({ visible, onClose }: SwapModalProps) {
  const { walletAddress } = useAuth();
  const { quote, status, error, fetchQuote, executeSwap, reset } = useSwap();

  const [inputToken, setInputToken] = useState<TokenInfo>(TOKENS[0]);
  const [outputToken, setOutputToken] = useState<TokenInfo>(TOKENS[1]);
  const [inputAmount, setInputAmount] = useState('');
  const [quoteTimer, setQuoteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setInputAmount('');
      reset();
      if (quoteTimer) clearTimeout(quoteTimer);
    }
  }, [visible]);

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
    reset();
  }, [inputToken, outputToken, reset]);

  const handleSwap = useCallback(async () => {
    if (!walletAddress) {
      Alert.alert('Wallet Not Connected', 'Please connect your wallet to swap tokens.');
      return;
    }

    const signature = await executeSwap();
    if (signature) {
      Alert.alert('Swap Successful', `Transaction confirmed.\n\nSignature: ${signature.slice(0, 8)}...`, [
        { text: 'Done', onPress: onClose },
      ]);
    }
  }, [walletAddress, executeSwap, onClose]);

  const handleClose = useCallback(() => {
    if (status === 'signing' || status === 'sending') {
      Alert.alert('Transaction in Progress', 'Please wait for the transaction to complete.');
      return;
    }
    onClose();
  }, [status, onClose]);

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
  const isBusy = status === 'signing' || status === 'sending' || status === 'confirming';
  const canSwap = quote && !isBusy && !isQuoting && parseFloat(inputAmount) > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Swap</Text>
            <Text style={styles.headerSubtitle}>Powered by Jupiter</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
        >
          {/* Input Token */}
          <View style={styles.tokenCard}>
            <Text style={styles.tokenLabel}>You pay</Text>
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
              {platformFeeAmount && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Platform fee (4%)</Text>
                  <Text style={styles.detailValue}>
                    {platformFeeAmount} {outputToken.symbol}
                  </Text>
                </View>
              )}
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

          {/* Error */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Swap Button */}
          <Pressable
            style={[styles.swapButton, !canSwap && styles.swapButtonDisabled]}
            onPress={handleSwap}
            disabled={!canSwap}
          >
            {isBusy ? (
              <View style={styles.swapButtonContent}>
                <ActivityIndicator size="small" color={COLORS.textInverse} />
                <Text style={styles.swapButtonText}>
                  {status === 'signing'
                    ? 'Confirm in wallet...'
                    : status === 'sending'
                    ? 'Sending...'
                    : 'Confirming...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.swapButtonText}>
                {!walletAddress
                  ? 'Connect Wallet'
                  : !inputAmount || parseFloat(inputAmount) <= 0
                  ? 'Enter Amount'
                  : isQuoting
                  ? 'Fetching Quote...'
                  : 'Swap'}
              </Text>
            )}
          </Pressable>

          {/* Info */}
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.textTertiary} />
            <Text style={styles.infoText}>
              Transactions are signed locally with your embedded wallet. Momento never has access to your private keys.
            </Text>
          </View>
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
  tokenLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.error,
    flex: 1,
  },
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
  swapButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
});
