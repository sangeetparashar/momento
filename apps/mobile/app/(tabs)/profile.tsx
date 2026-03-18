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
  ComingSoonModal,
  SettingsSheet,
  ProfileSkeleton,
} from '@/components/features';
import { useUserProfile, useWalletBalance } from '@/hooks';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import { UserRole } from '@momento/shared';

type ProfileTab = 'EDIT PROFILE' | 'NEW POST' | 'ACCOUNT';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isLoading } = useUserProfile();
  const walletQuery = useWalletBalance();
  const balance = walletQuery.data;
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

  const handleWalletPress = useCallback(() => {
    router.push('/wallet');
  }, [router]);

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
      // Delay showing ComingSoon modal so the settings sheet animation finishes first
      setTimeout(() => setShowComingSoon(true), 300);
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
            {/* Action Buttons */}
            <View style={styles.tabsContainer}>
              <Pressable
                onPress={() => router.push('/edit-profile')}
                style={[styles.tabButton, styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, styles.tabTextActive]}>EDIT PROFILE</Text>
              </Pressable>
              {isCreator && (
                <Pressable
                  onPress={() => router.push('/create-post')}
                  style={styles.tabButton}
                >
                  <Text style={styles.tabText}>NEW POST</Text>
                </Pressable>
              )}
            </View>

            {/* User Info */}
            {user && (
              <View style={styles.userInfoSection}>
                {user.email && (
                  <Text style={styles.emailText}>{user.email}</Text>
                )}
                {user.bio && (
                  <Text style={styles.bioText}>{user.bio}</Text>
                )}
                <View style={styles.followRow}>
                  <Text style={styles.followCount}>{user.followingCount ?? 0} <Text style={styles.followLabel}>Following</Text></Text>
                  {isCreator && (
                    <Text style={styles.followCount}>{user.followerCount ?? 0} <Text style={styles.followLabel}>Followers</Text></Text>
                  )}
                </View>
              </View>
            )}

            {/* Wallet Button */}
            <Pressable
              onPress={handleWalletPress}
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

            <View style={styles.bottomSpacer} />
          </>
        )}
      </ScrollView>

      {/* Modals */}
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
  bottomSpacer: {
    height: SPACING.xl,
  },
  userInfoSection: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  emailText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    marginBottom: SPACING.xs,
  },
  bioText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 22,
  },
  followRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.xs,
  },
  followCount: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  followLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
    fontWeight: '400',
  },
});
