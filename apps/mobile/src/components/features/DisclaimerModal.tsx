import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

const DISCLAIMER_ACCEPTED_KEY = 'momento_disclaimer_accepted';

interface DisclaimerModalProps {
  visible: boolean;
  onAccept: () => void;
}

/**
 * First-time sign-in disclaimer modal.
 * Shows beta notice, trading risk warning, and privacy/terms summary.
 * Must be accepted before using the app.
 */
export function DisclaimerModal({ visible, onAccept }: DisclaimerModalProps) {
  const insets = useSafeAreaInsets();
  const [termsChecked, setTermsChecked] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);

  const canAccept = termsChecked && riskChecked;

  const handleAccept = async () => {
    await AsyncStorage.setItem(DISCLAIMER_ACCEPTED_KEY, Date.now().toString()).catch(() => {});
    onAccept();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {}}
    >
      <View style={[styles.container, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.md }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.headerTitle}>Welcome to Momento</Text>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          {/* Beta Notice */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flask-outline" size={20} color={COLORS.warning} />
              <Text style={styles.sectionTitle}>Beta Software</Text>
            </View>
            <Text style={styles.sectionText}>
              Momento is currently in beta. Features may change, and you may experience bugs or service interruptions. We appreciate your patience and feedback as we continue to improve the platform.
            </Text>
          </View>

          {/* Trading Risk Warning */}
          <View style={[styles.section, styles.warningSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color={COLORS.error} />
              <Text style={[styles.sectionTitle, { color: COLORS.error }]}>Risk Disclosure</Text>
            </View>
            <Text style={styles.sectionText}>
              Trading digital assets involves significant risk and may not be suitable for all individuals. The value of creator tokens and other digital assets can fluctuate substantially, and you may lose some or all of your investment.
            </Text>
            <Text style={[styles.sectionText, { marginTop: SPACING.sm }]}>
              Past performance is not indicative of future results. You should not invest money that you cannot afford to lose. Momento does not provide investment, financial, legal, or tax advice.
            </Text>
            <Text style={[styles.sectionText, styles.boldText, { marginTop: SPACING.sm }]}>
              You are solely responsible for your trading decisions and any resulting gains or losses. Momento Technologies Inc. shall not be liable for any losses incurred through the use of this platform.
            </Text>
          </View>

          {/* How It Works */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>How Momento Works</Text>
            </View>
            <View style={styles.bulletList}>
              <BulletPoint text="Discover local creators and their content through a location-based feed" />
              <BulletPoint text="Each creator can launch a token that fans can buy and trade" />
              <BulletPoint text="Token prices fluctuate based on supply and demand" />
              <BulletPoint text="A secure embedded wallet is created for you automatically" />
              <BulletPoint text="All transactions occur on the Solana blockchain" />
            </View>
          </View>

          {/* Privacy & Data */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Privacy & Data</Text>
            </View>
            <Text style={styles.sectionText}>
              We collect location data to power the nearby creator feed. Your wallet keys are stored securely and Momento never has access to your private keys. We use industry-standard encryption and security practices to protect your data.
            </Text>
          </View>

          {/* Checkboxes */}
          <View style={styles.checkboxSection}>
            <Pressable
              onPress={() => setTermsChecked(!termsChecked)}
              style={styles.checkboxRow}
              hitSlop={4}
            >
              <View style={[styles.checkbox, termsChecked && styles.checkboxChecked]}>
                {termsChecked && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
              </View>
              <Text style={styles.checkboxLabel}>
                I agree to the Terms of Service and Privacy Policy
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setRiskChecked(!riskChecked)}
              style={styles.checkboxRow}
              hitSlop={4}
            >
              <View style={[styles.checkbox, riskChecked && styles.checkboxChecked]}>
                {riskChecked && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
              </View>
              <Text style={styles.checkboxLabel}>
                I understand that trading digital assets involves risk of loss, and I accept full responsibility for my trading decisions
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Accept Button */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleAccept}
            style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
            disabled={!canAccept}
          >
            <Text style={styles.acceptButtonText}>
              {canAccept ? 'Get Started' : 'Please accept to continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bullet} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

/** Check if user has already accepted the disclaimer */
export async function hasAcceptedDisclaimer(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(DISCLAIMER_ACCEPTED_KEY);
    return val != null;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  betaBadge: {
    backgroundColor: COLORS.warning + '25',
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    borderRadius: RADII.full,
  },
  betaBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.warning,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  warningSection: {
    borderColor: COLORS.error + '30',
    backgroundColor: COLORS.error + '08',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  sectionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  boldText: {
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  bulletList: {
    gap: SPACING.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 7,
  },
  bulletText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  checkboxSection: {
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  acceptButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.4,
  },
  acceptButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '700',
    fontSize: 16,
  },
});
