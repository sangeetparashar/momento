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
  SettingsSheet,
  ProfileSkeleton,
} from '@/components/features';
import { useUserProfile, useWalletBalance } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import { UserRole, type TokenHolding } from '@momento/shared';

type ProfileTab = 'EDIT PROFILE' | 'NEW POST' | 'ACCOUNT';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading } = useUserProfile();
  const walletQuery = useWalletBalance();
  const balance = walletQuery.data;
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('EDIT PROFILE');

  const isCreator = user?.role === UserRole.CREATOR;

  const handleTabPress = useCallback(
    (tab: ProfileTab) => {
      setActiveTab(tab);
      if (tab === 'EDIT PROFILE') {
        router.push('/edit-profile');
      } else if (tab === 'NEW POST') {
        router.push('/create-post');
      }
    },
    [router]
  );

  const handleBuyPress = useCallback((_token: TokenHolding) => {
    setShowComingSoon(true);
  }, []);

  const handleSettingsPress = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleSettingsNavigate = useCallback((route: string) => {
    setShowSettings(false);
    if (route === 'delete-account') {
      router.push('/delete-account');
    } else if (route === 'favorites') {
      router.push('/settings/favorites');
    } else if (route === 'permissions') {
      router.push('/settings/permissions');
    } else {
      setShowComingSoon(true);
    }
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.displayName}>
            {user?.displayName || user?.username || 'Profile'}
          </Text>
          <Pressable onPress={handleSettingsPress} hitSlop={8}>
            <Ionicons
              name="settings-outline"
              size={24}
              color={COLORS.textSecondary}
            />
          </Pressable>
        </View>

        {isLoading && !user ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* Creator Tabs */}
            {isCreator && (
              <View style={styles.tabsContainer}>
                {(['EDIT PROFILE', 'NEW POST', 'ACCOUNT'] as ProfileTab[]).map(
                  (tab) => (
                    <Pressable
                      key={tab}
                      onPress={() => handleTabPress(tab)}
                      style={[
                        styles.tabButton,
                        activeTab === tab && styles.tabButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          activeTab === tab && styles.tabTextActive,
                        ]}
                      >
                        {tab}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
            )}

            {/* Wallet Button */}
            <Pressable
              onPress={() => setShowSwapModal(true)}
              style={styles.walletButton}
            >
              <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
              <Text style={styles.walletText}>WALLET</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={COLORS.textTertiary}
              />
            </Pressable>

            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>24H CHANGE</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        (balance?.change24h ?? 0) >= 0
                          ? COLORS.success
                          : COLORS.error,
                    },
                  ]}
                >
                  {formatPercentage(balance?.change24h ?? 0)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>EARNINGS</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(balance?.earningsToDate ?? 0)}
                </Text>
              </View>
            </View>

            {/* Chart */}
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
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <SwapModal
        visible={showSwapModal}
        onClose={() => setShowSwapModal(false)}
      />
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
      />
      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onNavigate={handleSettingsNavigate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  displayName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: 3,
    marginBottom: SPACING.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.lg - 3,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: COLORS.backgroundTertiary,
  },
  tabText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: COLORS.textPrimary,
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.lg,
    marginBottom: SPACING.md,
  },
  walletText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
  },
  statLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  statValue: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    fontWeight: '800',
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
});
