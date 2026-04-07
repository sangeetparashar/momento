import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Share,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import {
  SwapModal,
  ComingSoonModal,
  FundWalletModal,
  SendModal,
  ChainSwitcher,
} from '@/components/features';
import { useWalletBalance } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { useChain } from '@/hooks/useChain';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage, truncateAddress } from '@/utils/formatters';
import { ENV } from '@/config/env';
import { usePressLogger } from '@/utils/pressLogger';
import { CHAIN_CONFIG } from '@momento/shared';
import type { TokenHolding, ChainType } from '@momento/shared';

/** Locally-stored transaction record */
interface TxRecord {
  signature: string;
  type: 'swap';
  label: string;
  timestamp: number;
}

const TX_STORAGE_KEY_BASE = 'momento_recent_txs';
const MAX_TX_RECORDS = 20;

/**
 * Per the project memory, AsyncStorage keys MUST be namespaced by userId so
 * each account gets its own state, AND recent transactions are chain-specific
 * (you can't show Solana txs while viewing the Base wallet). The key format is
 * `momento_recent_txs:<userId>:<chain>`. Falls back to a global key when no
 * user is loaded yet so initial render doesn't crash.
 */
function getTxStorageKey(userId: string | undefined, chain: ChainType): string {
  if (!userId) return `${TX_STORAGE_KEY_BASE}:${chain}`;
  return `${TX_STORAGE_KEY_BASE}:${userId}:${chain}`;
}

function getExplorerUrl(
  chain: ChainType,
  addressOrTx: string,
  type: 'address' | 'tx' = 'address',
): string {
  if (chain === 'base') {
    return `https://basescan.org/${type}/${addressOrTx}`;
  }
  // Solana
  const cluster = ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : '';
  const solType = type === 'address' ? 'account' : 'tx';
  return `https://solscan.io/${solType}/${addressOrTx}${cluster}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const { chain } = useChain();
  const chainConfig = CHAIN_CONFIG[chain];
  const walletQuery = useWalletBalance();
  const balance = walletQuery.data;
  const { startFastPolling } = walletQuery;
  const { user: profile } = useUserProfile();
  const { walletAddress: solWalletAddress, ethWalletAddress } = useAuth();
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recentTxs, setRecentTxs] = useState<TxRecord[]>([]);
  const logPress = usePressLogger('Wallet');

  // Load recent transactions from local storage + start fast polling after modals close.
  // The storage key is namespaced by userId AND chain so each user/chain combo has
  // its own list. Re-run when chain or user changes so the list updates on switch.
  useEffect(() => {
    AsyncStorage.getItem(getTxStorageKey(profile?.id, chain))
      .then(raw => {
        setRecentTxs(raw ? JSON.parse(raw) : []);
      })
      .catch(() => setRecentTxs([]));
    // When swap/fund modal closes, poll aggressively for 60s to catch the update
    if (!showSwapModal && !showFundModal && !showSendModal) {
      startFastPolling();
    }
  }, [showSwapModal, showFundModal, showSendModal, profile?.id, chain]);

  const handlePullRefresh = useCallback(() => {
    walletQuery.refetch();
  }, [walletQuery]);

  // Choose the wallet address based on the currently-selected chain. For Base
  // we use the Privy embedded ETH wallet address; for Solana we prefer the
  // Privy embedded Solana wallet, falling back to the server profile.
  const walletAddress =
    chain === 'base'
      ? ethWalletAddress
      : solWalletAddress ||
        (profile?.walletAddress && !profile.walletAddress.startsWith('pending-')
          ? profile.walletAddress
          : null);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleBuyPress = useCallback((_token: TokenHolding) => {
    setShowComingSoon(true);
  }, []);

  const handleSwapPress = useCallback(() => {
    setShowSwapModal(true);
  }, []);

  const handleBuyCrypto = useCallback(() => {
    setShowFundModal(true);
  }, []);

  const handleCopyAddress = useCallback(async () => {
    if (!walletAddress) return;
    try {
      await Share.share({ message: walletAddress });
    } catch {
      // user cancelled share sheet
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const handleOpenExplorer = useCallback(() => {
    if (!walletAddress) return;
    Linking.openURL(getExplorerUrl(chain, walletAddress, 'address'));
  }, [walletAddress, chain]);

  const change24h = balance?.change24h ?? 0;
  const isPositive = change24h >= 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={COLORS.textPrimary}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Pressable onPress={handleOpenExplorer} hitSlop={8} disabled={!walletAddress}>
          <Ionicons
            name="open-outline"
            size={20}
            color={walletAddress ? COLORS.textSecondary : 'transparent'}
          />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={walletQuery.isRefetching}
            onRefresh={handlePullRefresh}
            tintColor="#00FF88"
            colors={['#00FF88']}
            progressBackgroundColor="#242424"
          />
        }
      >
        {/* Wallet Address Card */}
        {walletAddress ? (
          <View style={styles.addressCard}>
            <View style={styles.addressRow}>
              <ChainSwitcher />
              <View style={{ flex: 1 }} />
              <View style={styles.networkBadge}>
                <Text style={styles.networkText}>
                  {chain === 'base'
                    ? (ENV.BASE_NETWORK === 'testnet' ? 'TESTNET' : 'MAINNET')
                    : (ENV.SOLANA_NETWORK === 'devnet' ? 'DEVNET' : 'MAINNET')}
                </Text>
              </View>
            </View>
            <View style={styles.addressActions}>
              <Pressable onPress={handleCopyAddress} style={styles.addressTouchable}>
                <Text style={styles.addressText}>
                  {truncateAddress(walletAddress, 8, 6)}
                </Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={16}
                  color={copied ? COLORS.success : COLORS.textTertiary}
                />
              </Pressable>
              <Pressable onPress={handleOpenExplorer} style={styles.solscanButton}>
                <Text style={styles.solscanText}>View on {chainConfig.explorerName}</Text>
                <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.addressCard}>
            <View style={styles.addressRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.addressLabel}>Creating wallet...</Text>
            </View>
          </View>
        )}

        {/* Total Balance */}
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceValue}>
            {formatCurrency(balance?.totalValueUsd ?? 0)}
          </Text>
          <View style={styles.changeRow}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={16}
              color={isPositive ? COLORS.success : COLORS.error}
            />
            <Text
              style={[
                styles.changeText,
                { color: isPositive ? COLORS.success : COLORS.error },
              ]}
            >
              {formatPercentage(change24h)} (24h)
            </Text>
          </View>
        </View>

        {/* Asset Cards */}
        {balance && (
          <View style={styles.assetsSection}>
            {/* Native Token Card (SOL or ETH depending on chain) */}
            {(() => {
              const nativeAmount = balance.nativeBalance ?? balance.solBalance ?? 0;
              const nativePrice = balance.nativePriceUsd ?? balance.solPriceUsd ?? 0;
              return (
                <View style={styles.assetCard}>
                  <View style={styles.assetLeft}>
                    <View style={[styles.assetIcon, { backgroundColor: chainConfig.iconColor }]}>
                      <Text style={styles.assetIconText}>{chainConfig.nativeIcon}</Text>
                    </View>
                    <View>
                      <Text style={styles.assetSymbol}>{chainConfig.symbol}</Text>
                      <Text style={styles.assetName}>{chainConfig.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetRight}>
                    <Text style={styles.assetAmount}>
                      {nativeAmount.toFixed(4)}
                    </Text>
                    <Text style={styles.assetValue}>
                      {formatCurrency(nativeAmount * nativePrice)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* USDC Card — show from token list or as zero */}
            {(() => {
              const usdc = balance.tokens.find(t => t.symbol === 'USDC' || t.symbol === 'usdc');
              return (
                <View style={styles.assetCard}>
                  <View style={styles.assetLeft}>
                    <View style={[styles.assetIcon, { backgroundColor: '#2775CA' }]}>
                      <Text style={styles.assetIconText}>$</Text>
                    </View>
                    <View>
                      <Text style={styles.assetSymbol}>USDC</Text>
                      <Text style={styles.assetName}>USD Coin</Text>
                    </View>
                  </View>
                  <View style={styles.assetRight}>
                    <Text style={styles.assetAmount}>
                      {(usdc?.amount ?? 0).toFixed(2)}
                    </Text>
                    <Text style={styles.assetValue}>
                      {formatCurrency(usdc?.valueUsd ?? usdc?.amount ?? 0)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Other tokens */}
            {balance.tokens
              .filter(t => t.symbol !== 'USDC' && t.symbol !== 'usdc')
              .map(token => (
                <Pressable
                  key={token.mint}
                  style={styles.assetCard}
                  onPress={() => handleBuyPress(token)}
                >
                  <View style={styles.assetLeft}>
                    <View style={[styles.assetIcon, { backgroundColor: COLORS.surface }]}>
                      <Text style={styles.assetIconText}>
                        {token.symbol?.charAt(0) ?? '?'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.assetSymbol}>{token.symbol}</Text>
                      <Text style={styles.assetName}>{token.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetRight}>
                    <Text style={styles.assetAmount}>
                      {token.amount < 1 ? token.amount.toFixed(6) : token.amount.toFixed(2)}
                    </Text>
                    {token.valueUsd != null && (
                      <Text style={styles.assetValue}>
                        {formatCurrency(token.valueUsd)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
          </View>
        )}

        {/* Recent Transactions */}
        {recentTxs.length > 0 && (
          <View style={styles.txSection}>
            <Text style={styles.txSectionTitle}>Recent Transactions</Text>
            {recentTxs.slice(0, 10).map(tx => (
              <Pressable
                key={tx.signature}
                style={styles.txRow}
                onPress={() => Linking.openURL(getExplorerUrl(chain, tx.signature, 'tx'))}
              >
                <View style={styles.txLeft}>
                  <View style={styles.txIcon}>
                    <Ionicons name="swap-horizontal" size={16} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.txLabel}>{tx.label}</Text>
                    <Text style={styles.txTime}>
                      {new Date(tx.timestamp).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <View style={styles.txRight}>
                  <Text style={styles.txSig} numberOfLines={1}>
                    {tx.signature.slice(0, 8)}...
                  </Text>
                  <Ionicons name="open-outline" size={12} color={COLORS.textTertiary} />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Fixed Bottom Buttons */}
      <View style={styles.swapButtonContainer}>
        <View style={styles.bottomButtons}>
          <Pressable onPress={() => { logPress('FUND_ACCOUNT'); handleBuyCrypto(); }} style={styles.buyButton} hitSlop={8}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.background} />
            <Text style={styles.buyButtonText}>FUND</Text>
          </Pressable>
          <Pressable onPress={() => { logPress('SWAP'); handleSwapPress(); }} style={styles.swapButton} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={18} color={COLORS.background} />
            <Text style={styles.swapButtonText}>SWAP</Text>
          </Pressable>
          <Pressable onPress={() => { logPress('SEND'); setShowSendModal(true); }} style={styles.sendButton} hitSlop={8}>
            <Ionicons name="paper-plane" size={18} color={COLORS.primary} />
            <Text style={styles.sendButtonText}>SEND</Text>
          </Pressable>
        </View>
      </View>

      {/* Modals */}
      <SwapModal
        visible={showSwapModal}
        onClose={() => setShowSwapModal(false)}
      />
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
      />
      <FundWalletModal
        visible={showFundModal}
        onClose={() => setShowFundModal(false)}
      />
      <SendModal
        visible={showSendModal}
        onClose={() => setShowSendModal(false)}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  // Wallet Address Card
  addressCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  addressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  addressLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    flex: 1,
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
  addressActions: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.md,
  },
  addressText: {
    ...TYPOGRAPHY.mono,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  solscanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  solscanText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  // Balance
  balanceContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  balanceLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  balanceValue: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 36,
    lineHeight: 44,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
  },
  changeText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  // Asset Cards
  assetsSection: {
    marginHorizontal: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  assetCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetIconText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  assetSymbol: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  assetName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  assetAmount: {
    ...TYPOGRAPHY.mono,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  assetValue: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Recent Transactions
  txSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  txSectionTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  txTime: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },
  txRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  txSig: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
  swapButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl + 20,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  bottomButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  buyButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  buyButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
  swapButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    // 3D elevated look
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  swapButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
  sendButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
});
