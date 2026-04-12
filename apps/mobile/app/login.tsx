import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import type { OAuthProvider } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, MomentoLogo } from '@/components/primitives';
import { GoogleIcon, AppleIcon, XIcon, InstagramIcon, TikTokIcon } from '@/components/primitives/BrandIcons';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { isPrivyAvailable } = usePrivyGuard();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);

  // Email OTP state
  const [showEmailFlow, setShowEmailFlow] = useState(false);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailStep, setEmailStep] = useState<'email' | 'code'>('email');
  const [emailLoading, setEmailLoading] = useState(false);

  const handleAuth = useCallback(async (provider: OAuthProvider) => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      setShowSocialModal(false);
      setIsAuthenticating(true);
      await auth.login(provider);
      queryClient.invalidateQueries();
      router.replace('/');
    } catch (error: any) {
      setIsAuthenticating(false);
      if (!error?.message?.includes('cancel')) {
        Alert.alert('Login Error', error?.message || String(error));
      }
    }
  }, [auth, router, isPrivyAvailable, queryClient]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    try {
      setEmailLoading(true);
      await auth.sendEmailCode(email.trim());
      setEmailStep('code');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to send verification code.');
    } finally {
      setEmailLoading(false);
    }
  }, [email, auth]);

  const handleVerifyCode = useCallback(async () => {
    if (otpCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code from your email.');
      return;
    }
    try {
      setEmailLoading(true);
      await auth.loginWithEmailCode(otpCode.trim());
      queryClient.invalidateQueries();
      router.replace('/');
    } catch (error: any) {
      setEmailLoading(false);
      Alert.alert('Verification Failed', error?.message || 'Invalid or expired code.');
    }
  }, [otpCode, auth, queryClient, router]);

  // Loading state
  if (isAuthenticating || auth.user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <MomentoLogo size={64} showText />
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
          <Text style={styles.loadingText}>Setting up your experience...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.topSpacer} />

          <View style={styles.logoContainer}>
            <MomentoLogo size={80} showText />
            <Text style={styles.subtitle}>THE STOCK MARKET FOR CULTURE</Text>
          </View>

          <View style={styles.bottomSpacer} />

          <View style={styles.actions}>
            {showEmailFlow ? (
              /* ─── Email OTP Flow ─── */
              <View style={styles.emailFlowContainer}>
                {emailStep === 'email' ? (
                  <>
                    <TextInput
                      style={styles.emailInput}
                      placeholder="Enter your email"
                      placeholderTextColor={COLORS.textTertiary}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!emailLoading}
                    />
                    <Pressable
                      onPress={handleSendCode}
                      style={[styles.primaryButton, emailLoading && styles.buttonDisabled]}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        <ActivityIndicator size="small" color={COLORS.background} />
                      ) : (
                        <Text style={styles.primaryButtonText}>SEND CODE</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.emailHint}>Code sent to {email}</Text>
                    <TextInput
                      style={styles.emailInput}
                      placeholder="Enter 6-digit code"
                      placeholderTextColor={COLORS.textTertiary}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!emailLoading}
                    />
                    <Pressable
                      onPress={handleVerifyCode}
                      style={[styles.primaryButton, emailLoading && styles.buttonDisabled]}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        <ActivityIndicator size="small" color={COLORS.background} />
                      ) : (
                        <Text style={styles.primaryButtonText}>VERIFY</Text>
                      )}
                    </Pressable>
                  </>
                )}
                <Pressable
                  onPress={() => { setShowEmailFlow(false); setEmailStep('email'); setOtpCode(''); }}
                  style={styles.backLink}
                >
                  <Text style={styles.backLinkText}>← BACK TO LOGIN</Text>
                </Pressable>
              </View>
            ) : (
              /* ─── Primary Login Buttons ─── */
              <>
                {/* Apple */}
                <Pressable onPress={() => handleAuth('apple')} style={styles.appleButton}>
                  <AppleIcon size={20} color="#000000" />
                  <Text style={styles.appleButtonText}>CONTINUE WITH APPLE</Text>
                </Pressable>

                {/* Google */}
                <Pressable onPress={() => handleAuth('google')} style={styles.googleButton}>
                  <GoogleIcon size={20} />
                  <Text style={styles.googleButtonText}>CONTINUE WITH GOOGLE</Text>
                </Pressable>

                {/* Email */}
                <Pressable onPress={() => setShowEmailFlow(true)} style={styles.emailButton}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.emailButtonText}>CONTINUE WITH EMAIL</Text>
                </Pressable>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Other social logins */}
                <Pressable onPress={() => setShowSocialModal(true)} style={styles.socialLink}>
                  <Text style={styles.socialLinkText}>OTHER LOGIN OPTIONS</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── Social Login Modal ─── */}
      <Modal
        visible={showSocialModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSocialModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowSocialModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>OTHER LOGIN OPTIONS</Text>

            <Pressable onPress={() => handleAuth('twitter')} style={styles.modalButton}>
              <XIcon size={18} color={COLORS.textPrimary} />
              <Text style={styles.modalButtonText}>CONTINUE WITH X</Text>
            </Pressable>

            <Pressable onPress={() => handleAuth('instagram')} style={styles.modalButton}>
              <InstagramIcon size={18} color="#E1306C" />
              <Text style={styles.modalButtonText}>CONTINUE WITH INSTAGRAM</Text>
            </Pressable>

            <Pressable onPress={() => handleAuth('tiktok' as OAuthProvider)} style={styles.modalButton}>
              <TikTokIcon size={18} color="#00F2EA" />
              <Text style={styles.modalButtonText}>CONTINUE WITH TIKTOK</Text>
            </Pressable>

            <Pressable onPress={() => setShowSocialModal(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>CANCEL</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Shared bases ───
const buttonBase = {
  paddingVertical: SPACING.md,
  paddingHorizontal: SPACING.xl,
  borderRadius: RADII.full,
  width: '100%' as const,
  alignItems: 'center' as const,
  flexDirection: 'row' as const,
  justifyContent: 'center' as const,
  gap: SPACING.sm,
  marginBottom: SPACING.sm,
};

const textBase = {
  ...TYPOGRAPHY.body,
  fontWeight: '800' as const,
  letterSpacing: 2,
  fontSize: 14,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  topSpacer: { flex: 2 },
  logoContainer: { alignItems: 'center' },
  subtitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    letterSpacing: 4,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  bottomSpacer: { flex: 3 },
  actions: { alignItems: 'center', paddingBottom: SPACING.xl },

  // ─── Apple ───
  appleButton: { ...buttonBase, backgroundColor: '#FFFFFF' },
  appleButtonText: { ...textBase, color: '#000000' },

  // ─── Google ───
  googleButton: {
    ...buttonBase,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  googleButtonText: { ...textBase, color: COLORS.background },

  // ─── Email ───
  emailButton: {
    ...buttonBase,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  emailButtonText: { ...textBase, color: COLORS.primary },

  // ─── Divider ───
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: SPACING.md,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dividerText: { ...TYPOGRAPHY.body, color: COLORS.textTertiary, marginHorizontal: SPACING.md, fontSize: 13 },

  // ─── Other login link ───
  socialLink: { paddingVertical: SPACING.sm },
  socialLinkText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600',
    fontSize: 12,
  },

  // ─── Email OTP flow ───
  emailFlowContainer: { width: '100%', gap: SPACING.md },
  emailInput: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
  },
  emailHint: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, textAlign: 'center' },
  primaryButton: { ...buttonBase, backgroundColor: COLORS.primary, marginBottom: 0 },
  primaryButtonText: { ...textBase, color: COLORS.background },
  backLink: { alignItems: 'center', paddingVertical: SPACING.sm },
  backLinkText: { ...TYPOGRAPHY.caption, color: COLORS.textTertiary, letterSpacing: 1, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },

  // ─── Social Modal ───
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xl + 20,
    gap: SPACING.sm,
  },
  modalTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: SPACING.md,
    fontSize: 11,
  },
  modalButton: {
    ...buttonBase,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 0,
  },
  modalButtonText: { ...textBase, color: COLORS.textPrimary, fontSize: 13 },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalCancelText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textTertiary,
    letterSpacing: 1.5,
    fontWeight: '600',
    fontSize: 12,
  },

  // ─── Loading ───
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.md },
});
