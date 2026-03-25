import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Share,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import {
  PortfolioChart,
  SwapModal,
  ComingSoonModal,
  FundWalletModal,
} from '@/components/features';
import { useWalletBalance, useSwipeNavigation } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage, truncateAddress } from '@/utils/formatters';
import { ENV } from '@/config/env';
import type { TokenHolding } from '@momento/shared';

function getSolscanUrl(address: string): string {
  const cluster = ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/account/${address}${cluster}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const { translateX, onTouchStart, onTouchEnd } = useSwipeNavigation({ currentScreen: '/wallet' });
  const walletQuery = useWalletBalance();
  const balance = walletQuery.data;
  const { user: profile } = useUserProfile();
  const { walletAddress: clientWalletAddress } = useAuth();
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Prefer the client-side wallet address (from Privy SDK), fall back to server profile
  const walletAddress =
    clientWalletAddress ||
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

  const handleOpenSolscan = useCallback(() => {
    if (!walletAddress) return;
    Linking.openURL(getSolscanUrl(walletAddress));
  }, [walletAddress]);

  const change24h = balance?.change24h ?? 0;
  const isPositive = change24h >= 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Animated.View style={[{ flex: 1 }, { transform: [{ translateX }] }]}>
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
        <Pressable onPress={handleOpenSolscan} hitSlop={8} disabled={!walletAddress}>
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
      >
        {/* Wallet Address Card */}
        {walletAddress ? (
          <View style={styles.addressCard}>
            <View style={styles.addressRow}>
              <View style={styles.addressDot} />
              <Text style={styles.addressLabel}>Solana Wallet</Text>
              <View style={styles.networkBadge}>
                <Text style={styles.networkText}>
                  {ENV.SOLANA_NETWORK === 'devnet' ? 'DEVNET' : 'MAINNET'}
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
              <Pressable onPress={handleOpenSolscan} style={styles.solscanButton}>
                <Text style={styles.solscanText}>View on Solscan</Text>
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
            {/* SOL Card */}
            <View style={styles.assetCard}>
              <View style={styles.assetLeft}>
                <View style={[styles.assetIcon, { backgroundColor: '#9945FF' }]}>
                  <Text style={styles.assetIconText}>◎</Text>
                </View>
                <View>
                  <Text style={styles.assetSymbol}>SOL</Text>
                  <Text style={styles.assetName}>Solana</Text>
                </View>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.assetAmount}>
                  {balance.solBalance.toFixed(4)}
                </Text>
                <Text style={styles.assetValue}>
                  {formatCurrency(balance.solBalance * (balance.solPriceUsd ?? 0))}
                </Text>
              </View>
            </View>

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

        {/* Portfolio Chart — Real SOL price history */}
        <PortfolioChart solBalance={balance?.solBalance} />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Fixed Bottom Buttons */}
      <View style={styles.swapButtonContainer}>
        <View style={styles.bottomButtons}>
          <Pressable onPress={handleBuyCrypto} style={styles.buyButton}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.background} />
            <Text style={styles.buyButtonText}>FUND ACCOUNT</Text>
          </Pressable>
          <Pressable onPress={handleSwapPress} style={styles.swapButton}>
            <Ionicons name="swap-horizontal" size={20} color={COLORS.background} />
            <Text style={styles.swapButtonText}>SWAP</Text>
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
      </Animated.View>
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
    backgroundColor: COLORS.backgroundTertiary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  swapButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 16,
  },
});
