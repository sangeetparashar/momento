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
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';
import { useChain } from '@/hooks/useChain';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import { apiService } from '@/services/api';
import { ENV } from '@/config/env';
import { CHAIN_CONFIG } from '@momento/shared';
import type { ChainType } from '@momento/shared';

const TX_STORAGE_KEY_BASE = 'momento_recent_txs';
const MAX_TX_RECORDS = 20;

/** Per-user, per-chain tx storage key — must match wallet.tsx getTxStorageKey */
function getTxStorageKey(userId: string | undefined, chain: ChainType): string {
  if (!userId) return `${TX_STORAGE_KEY_BASE}:${chain}`;
  return `${TX_STORAGE_KEY_BASE}:${userId}:${chain}`;
}
const BASE_CHAIN_ID_HEX = '0x2105'; // 8453

interface SendModalProps {
  visible: boolean;
  onClose: () => void;
}

type SendToken = string;

/** Minimum amounts to send (per token symbol) */
const MIN_SEND: Record<string, number> = {
  SOL: 0.001,
  ETH: 0.0001,
  USDC: 0.01,
};
/** Minimum native token to keep for fees */
const MIN_NATIVE_FOR_FEES: Record<'solana' | 'base', number> = {
  solana: 0.005,
  base: 0.0002,
};

type SendStep = 'form' | 'confirming' | 'success' | 'error';

/**
 * Send modal — allows users to send SOL or USDC to any Solana wallet address.
 * Uses the API's /wallet/send endpoint which constructs and submits the transaction
 * using the Privy embedded wallet for signing.
 */
export function SendModal({ visible, onClose }: SendModalProps) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { walletAddress, getWalletProvider } = auth;
  const { chain } = useChain();
  const { user: profile } = useUserProfile();
  const balanceQuery = useWalletBalance();
  const balance: any = balanceQuery.data;

  const nativeSymbol = CHAIN_CONFIG[chain].symbol; // 'SOL' or 'ETH'
  const explorerBase = CHAIN_CONFIG[chain].explorerUrl;
  const explorerName = CHAIN_CONFIG[chain].explorerName;
  const minNativeForFees = MIN_NATIVE_FOR_FEES[chain];
  const myAddress = chain === 'base' ? auth.ethWalletAddress : walletAddress;

  const [token, setToken] = useState<SendToken>(nativeSymbol);
  const [amount, setAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [step, setStep] = useState<SendStep>('form');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset on open
  useEffect(() => {
    if (visible) {
      setStep('form');
      setAmount('');
      setRecipientAddress('');
      setTxSignature(null);
      setErrorMessage('');
    }
  }, [visible]);

  // Reset selected token when chain changes
  useEffect(() => {
    setToken(CHAIN_CONFIG[chain].symbol);
    setAmount('');
    setRecipientAddress('');
  }, [chain]);

  const nativeBalance: number =
    balance?.nativeBalance ??
    (chain === 'solana' ? balance?.solBalance : 0) ??
    0;
  const usdcBalance: number = (() => {
    const usdc = balance?.tokens?.find(
      (t: any) => t.symbol === 'USDC' || t.symbol === 'usdc',
    );
    return usdc?.amount ?? 0;
  })();

  const currentBalance = token === nativeSymbol ? nativeBalance : usdcBalance;
  const parsedAmount = parseFloat(amount) || 0;

  // Address validation (chain-aware)
  const isValidAddress =
    chain === 'base'
      ? /^0x[a-fA-F0-9]{40}$/.test(recipientAddress)
      : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipientAddress);
  const isSelfSend =
    !!myAddress && recipientAddress.toLowerCase() === myAddress.toLowerCase();
  const minForToken = MIN_SEND[token] ?? 0;
  const isAmountValid = parsedAmount >= minForToken;
  const hasEnoughBalance = parsedAmount <= currentBalance;
  const hasEnoughNativeForFees =
    token === nativeSymbol
      ? currentBalance - parsedAmount >= minNativeForFees
      : nativeBalance >= minNativeForFees;

  const canSend =
    isValidAddress && !isSelfSend && isAmountValid && hasEnoughBalance && hasEnoughNativeForFees;

  const getButtonText = () => {
    if (!recipientAddress) return 'Enter recipient address';
    if (!isValidAddress) {
      return chain === 'base'
        ? 'Invalid Base address'
        : 'Invalid Solana address';
    }
    if (isSelfSend) return "Can't send to yourself";
    if (!amount || parsedAmount === 0) return 'Enter amount';
    if (!isAmountValid) return `Min ${minForToken} ${token}`;
    if (!hasEnoughBalance) return 'Insufficient balance';
    if (!hasEnoughNativeForFees) return `Need ${minNativeForFees} ${nativeSymbol} for fees`;
    return `Send ${amount} ${token}`;
  };

  const handleMax = useCallback(() => {
    if (token === nativeSymbol) {
      const maxNative = Math.max(0, nativeBalance - minNativeForFees);
      setAmount(maxNative > 0 ? maxNative.toFixed(6) : '0');
    } else {
      setAmount(usdcBalance > 0 ? usdcBalance.toFixed(2) : '0');
    }
  }, [token, nativeSymbol, nativeBalance, usdcBalance, minNativeForFees]);

  const handleSend = useCallback(async () => {
    if (!canSend || !myAddress) return;

    try {
      setStep('confirming');

      let signature: string;

      if (chain === 'base') {
        // ─── BASE SEND ───
        const txParams = await apiService.post<{
          chain: 'base';
          to: string;
          value: string;
          data?: string;
          gas?: string;
          chainId?: number;
          from?: string;
        }>('/wallet/send', {
          chain: 'base',
          recipientAddress,
          amount: parsedAmount.toString(),
          token,
        });

        const provider = await auth.getEthWalletProvider?.();
        if (!provider) {
          throw new Error('ETH wallet provider not available — try again in a moment');
        }

        const sendTx: Record<string, string> = {
          from: myAddress,
          to: txParams.to,
          value: txParams.value || '0x0',
          data: txParams.data || '0x',
          chainId: BASE_CHAIN_ID_HEX,
        };
        if (txParams.gas) {
          sendTx.gas = txParams.gas.startsWith('0x')
            ? txParams.gas
            : '0x' + parseInt(txParams.gas, 10).toString(16);
        }

        const txHash: string = await provider.request({
          method: 'eth_sendTransaction',
          params: [sendTx],
        });

        // Poll for receipt
        const start = Date.now();
        let receipt: any = null;
        while (Date.now() - start < 60000) {
          try {
            receipt = await provider.request({
              method: 'eth_getTransactionReceipt',
              params: [txHash],
            });
            if (receipt) break;
          } catch {
            // ignore transient errors
          }
          await new Promise((r) => setTimeout(r, 2000));
        }

        signature = txHash;
      } else {
        // ─── SOLANA SEND (unchanged) ───
        const { transaction: serializedTx } = await apiService.post<{ transaction: string }>(
          '/wallet/send',
          {
            chain,
            recipientAddress,
            amount: parsedAmount.toString(),
            token,
          },
        );

        const provider = await getWalletProvider();
        if (!provider) {
          throw new Error('Wallet provider not available — try again in a moment');
        }

        const { Buffer } = require('buffer');
        const { VersionedTransaction, Connection } = require('@solana/web3.js');

        const txBytes = Buffer.from(serializedTx, 'base64');
        const tx = VersionedTransaction.deserialize(txBytes);

        const connection = new Connection(ENV.SOLANA_RPC_URL, 'confirmed');

        const signedResult = await provider.signTransaction(tx);
        const rawTx = signedResult.serialize();
        signature = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction(signature, 'confirmed');
      }

      setTxSignature(signature);
      setStep('success');

      // Store in local tx history
      try {
        const txKey = getTxStorageKey(profile?.id, chain);
        const raw = await AsyncStorage.getItem(txKey);
        const existing = raw ? JSON.parse(raw) : [];
        const newTx = {
          signature,
          type: 'send',
          chain,
          label: `Sent ${parsedAmount} ${token}`,
          timestamp: Date.now(),
        };
        const updated = [newTx, ...existing].slice(0, MAX_TX_RECORDS);
        await AsyncStorage.setItem(txKey, JSON.stringify(updated));
      } catch { /* storage failure is non-critical */ }

      // Log to server for persistent history (fire-and-forget)
      apiService.post('/wallet/transactions/log', {
        chain,
        signature,
        type: 'send',
        label: `Sent ${parsedAmount} ${token}`,
        inputToken: token,
        inputAmount: parsedAmount.toString(),
        recipientAddress,
      }).catch(() => {});

      // Refresh balance
      setTimeout(() => balanceQuery.refetch(), 2000);
      setTimeout(() => balanceQuery.refetch(), 6000);

    } catch (err: any) {
      console.warn('[SendModal] Send failed:', err?.message || err);
      setErrorMessage(err?.message || 'Transaction failed. Please try again.');
      setStep('error');
    }
  }, [canSend, myAddress, chain, recipientAddress, parsedAmount, token, getWalletProvider, auth, balanceQuery]);

  const handleClose = useCallback(() => {
    setStep('form');
    onClose();
  }, [onClose]);

  const explorerUrl = txSignature
    ? chain === 'base'
      ? `${explorerBase}/tx/${txSignature}`
      : `${explorerBase}/tx/${txSignature}${ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : ''}`
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.md }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={COLORS.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>Send Tokens</Text>
          <View style={{ width: 24 }} />
        </View>

        {step === 'form' && (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
            {/* Token Selector */}
            <View style={styles.tokenSelector}>
              {([nativeSymbol, 'USDC'] as SendToken[]).map(t => {
                const isNative = t === nativeSymbol;
                return (
                  <Pressable
                    key={t}
                    onPress={() => { setToken(t); setAmount(''); }}
                    style={[styles.tokenTab, token === t && styles.tokenTabActive]}
                  >
                    <Text
                      style={[
                        styles.tokenTabIcon,
                        {
                          color: isNative
                            ? CHAIN_CONFIG[chain].iconColor
                            : '#2775CA',
                        },
                      ]}
                    >
                      {isNative ? CHAIN_CONFIG[chain].nativeIcon : '$'}
                    </Text>
                    <Text style={[styles.tokenTabText, token === t && styles.tokenTabTextActive]}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Balance info */}
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Available</Text>
              <Pressable onPress={handleMax}>
                <Text style={styles.balanceValue}>
                  {token === nativeSymbol ? nativeBalance.toFixed(4) : usdcBalance.toFixed(2)} {token}
                  <Text style={styles.maxHint}> (MAX)</Text>
                </Text>
              </Pressable>
            </View>

            {/* Amount Input */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Amount</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder={`0.00 ${token}`}
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            {/* Recipient Address */}
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>Recipient Wallet Address</Text>
              <TextInput
                style={styles.addressInput}
                value={recipientAddress}
                onChangeText={setRecipientAddress}
                placeholder={
                  chain === 'base'
                    ? 'Enter Base (0x...) wallet address...'
                    : 'Enter Solana wallet address...'
                }
                placeholderTextColor={COLORS.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              {recipientAddress.length > 0 && !isValidAddress && (
                <Text style={styles.inputError}>
                  {chain === 'base'
                    ? 'Enter a valid Base address (0x... 40 hex chars)'
                    : 'Enter a valid Solana address (32-44 chars)'}
                </Text>
              )}
              {isSelfSend && (
                <Text style={styles.inputError}>Cannot send to your own wallet</Text>
              )}
            </View>

            {/* Warning */}
            <View style={styles.warningCard}>
              <Ionicons name="warning-outline" size={18} color={COLORS.warning} />
              <Text style={styles.warningText}>
                Double-check the recipient address. Transactions on the {CHAIN_CONFIG[chain].name} blockchain are irreversible.
              </Text>
            </View>

            {/* Network info */}
            <View style={styles.networkRow}>
              <Text style={styles.networkLabel}>Network</Text>
              <View style={styles.networkBadge}>
                <Text style={styles.networkText}>
                  {chain === 'base'
                    ? 'BASE'
                    : ENV.SOLANA_NETWORK === 'devnet'
                    ? 'SOLANA DEVNET'
                    : 'SOLANA MAINNET'}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {step === 'confirming' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.statusTitle}>Sending {amount} {token}</Text>
            <Text style={styles.statusSubtitle}>
              Signing and broadcasting transaction...
            </Text>
          </View>
        )}

        {step === 'success' && (
          <View style={styles.statusContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
            </View>
            <Text style={styles.statusTitle}>Sent Successfully!</Text>
            <Text style={styles.statusSubtitle}>
              {amount} {token} sent to {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
            </Text>
            {explorerUrl && (
              <Pressable
                onPress={() => Linking.openURL(explorerUrl)}
                style={styles.solscanLink}
              >
                <Text style={styles.solscanLinkText}>View on {explorerName}</Text>
                <Ionicons name="open-outline" size={14} color={COLORS.primary} />
              </Pressable>
            )}
          </View>
        )}

        {step === 'error' && (
          <View style={styles.statusContainer}>
            <Ionicons name="close-circle" size={64} color={COLORS.error} />
            <Text style={styles.statusTitle}>Transaction Failed</Text>
            <Text style={styles.statusSubtitle}>{errorMessage}</Text>
          </View>
        )}

        {/* Bottom Action */}
        <View style={styles.footer}>
          {step === 'form' ? (
            <Pressable
              onPress={handleSend}
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              disabled={!canSend}
            >
              <Ionicons name="paper-plane" size={18} color={canSend ? COLORS.background : COLORS.textTertiary} />
              <Text style={[styles.sendButtonText, !canSend && styles.sendButtonTextDisabled]}>
                {getButtonText()}
              </Text>
            </Pressable>
          ) : step === 'confirming' ? null : (
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>
                {step === 'success' ? 'Done' : 'Close'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  // Token selector
  tokenSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tokenTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tokenTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  tokenTabIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  tokenTabText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  tokenTabTextActive: {
    color: COLORS.textPrimary,
  },
  // Balance
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  balanceLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
    fontSize: 14,
  },
  balanceValue: {
    ...TYPOGRAPHY.mono,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  maxHint: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  // Input cards
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    fontSize: 11,
  },
  amountInput: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 28,
    padding: 0,
  },
  addressInput: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontSize: 15,
    padding: 0,
    minHeight: 44,
  },
  inputError: {
    ...TYPOGRAPHY.caption,
    color: COLORS.error,
    marginTop: SPACING.xs,
    fontSize: 12,
  },
  // Warning
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning + '10',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  warningText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.warning,
    flex: 1,
    lineHeight: 20,
  },
  // Network
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  networkLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
    fontSize: 14,
  },
  networkBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  networkText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1,
  },
  // Status screens
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successIcon: {
    marginBottom: SPACING.md,
  },
  statusTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  statusSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  solscanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: RADII.full,
  },
  solscanLinkText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
  // Footer
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingVertical: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    // 3D look
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  sendButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 16,
  },
  sendButtonTextDisabled: {
    color: COLORS.textTertiary,
  },
  closeButton: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
});
