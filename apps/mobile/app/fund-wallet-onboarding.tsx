import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, MomentoLogo } from '@/components/primitives';
import { FundWalletModal } from '@/components/features';
import { markFundingScreenSeen } from '@/services/onboardingStorage';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

const BENEFITS = [
  { icon: 'flash-outline' as const, title: 'Instant Trading', desc: 'Buy and sell creator tokens in seconds' },
  { icon: 'heart-outline' as const, title: 'Support Creators', desc: 'Invest in creators you believe in' },
  { icon: 'trending-up-outline' as const, title: 'Earn Rewards', desc: 'Grow your portfolio as creators rise' },
];

export default function FundWalletOnboardingScreen() {
  const router = useRouter();
  const [showFundModal, setShowFundModal] = useState(false);

  const handleFund = useCallback(() => {
    setShowFundModal(true);
  }, []);

  const handleFundModalClose = useCallback(async () => {
    setShowFundModal(false);
    // Whether they actually funded or just closed the modal,
    // mark as seen and proceed to home
    await markFundingScreenSeen();
    router.replace('/(tabs)/home');
  }, [router]);

  const handleSkip = useCallback(async () => {
    await markFundingScreenSeen();
    router.replace('/(tabs)/home');
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Top section */}
        <View style={styles.topSection}>
          <MomentoLogo size={40} showText />

          <View style={styles.iconCircle}>
            <Ionicons name="wallet-outline" size={48} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>Fund Your Account</Text>
          <Text style={styles.subtitle}>
            Add $5–10 to start trading creator tokens and unlock the full Momento experience.
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b.icon} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon} size={22} color={COLORS.primary} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* CTAs */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleFund} style={styles.primaryButton} activeOpacity={0.7}>
            <Text style={styles.primaryText}>FUND MY ACCOUNT</Text>
          </TouchableOpacity>

          <Pressable onPress={handleSkip} style={styles.skipLink} hitSlop={8}>
            <Text style={styles.skipText}>Skip for now</Text>
            <Ionicons name="arrow-forward" size={14} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      </View>

      <FundWalletModal visible={showFundModal} onClose={handleFundModalClose} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  topSection: {
    alignItems: 'center',
    marginTop: SPACING.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xxl,
    marginBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
  },
  benefits: {
    marginTop: SPACING.xxl,
    gap: SPACING.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  benefitDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
  },
  actions: {
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full,
    width: '100%',
    alignItems: 'center',
  },
  primaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 16,
  },
  skipLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  skipText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
