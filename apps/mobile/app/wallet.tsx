import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import {
  PortfolioChart,
  TokenList,
  SwapModal,
  ComingSoonModal,
} from '@/components/features';
import { useWalletBalance } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import type { TokenHolding } from '@momento/shared';

export default function WalletScreen() {
  const router = useRouter();
  const walletQuery = useWalletBalance();
  const balance = walletQuery.data;
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleBuyPress = useCallback((_token: TokenHolding) => {
    setShowComingSoon(true);
  }, []);

  const handleSwapPress = useCallback(() => {
    setShowSwapModal(true);
  }, []);

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
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Total Balance */}
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceValue}>
            {formatCurrency(balance?.totalValueUsd ?? 0)}
          </Text>
          <Text
            style={[
              styles.changeText,
              { color: isPositive ? COLORS.success : COLORS.error },
            ]}
          >
            {isPositive ? '+' : ''}
            {formatPercentage(change24h)} (24h)
          </Text>
        </View>

        {/* Portfolio Chart */}
        <PortfolioChart />

        {/* Token List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Portfolio</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(balance?.totalValueUsd ?? 0)}
          </Text>
        </View>
        <TokenList
          tokens={balance?.tokens ?? []}
          onBuyPress={handleBuyPress}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Fixed SWAP Button */}
      <View style={styles.swapButtonContainer}>
        <Pressable onPress={handleSwapPress} style={styles.swapButton}>
          <Ionicons name="swap-horizontal" size={20} color={COLORS.background} />
          <Text style={styles.swapButtonText}>SWAP</Text>
        </Pressable>
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
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  balanceContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
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
  changeText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  totalValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 18,
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
  swapButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADII.full,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  swapButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 18,
  },
});
