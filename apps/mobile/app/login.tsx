import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { isPrivyAvailable } = usePrivyGuard();

  const handleSignUp = useCallback(async () => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      await auth.login();
      queryClient.invalidateQueries();
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Login Error', error?.message || String(error));
    }
  }, [auth, router, isPrivyAvailable, queryClient]);

  const handleLogin = useCallback(async () => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      await auth.login();
      queryClient.invalidateQueries();
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Login Error', error?.message || String(error));
    }
  }, [auth, router, isPrivyAvailable, queryClient]);

  // In Expo Go, add a "Preview Mode" button to skip login
  const handlePreview = useCallback(() => {
    Alert.alert(
      'Preview Mode',
      'You are browsing without signing in. Some features may be limited.',
      [{ text: 'Continue', onPress: () => router.replace('/(tabs)/home') }]
    );
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Spacer */}
        <View style={styles.topSpacer} />

        {/* Logo */}
        <View style={styles.logoContainer}>
          <MomentoLogo size={80} showText />
          <Text style={styles.subtitle}>THE STOCK MARKET FOR CULTURE</Text>
        </View>

        {/* Spacer */}
        <View style={styles.bottomSpacer} />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleSignUp} style={styles.signUpButton} activeOpacity={0.7}>
            <Text style={styles.signUpText}>SIGN UP</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogin} style={styles.loginLink} activeOpacity={0.7}>
            <Text style={styles.loginText}>OR LOGIN</Text>
          </TouchableOpacity>

          {!isPrivyAvailable && (
            <TouchableOpacity onPress={handlePreview} style={styles.previewLink} activeOpacity={0.7}>
              <Text style={styles.previewText}>PREVIEW MODE (EXPO GO)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  topSpacer: {
    flex: 2,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textPrimary,
    fontSize: 32,
    letterSpacing: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    letterSpacing: 4,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  bottomSpacer: {
    flex: 3,
  },
  actions: {
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  signUpButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full,
    width: '100%',
    alignItems: 'center',
  },
  signUpText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 18,
  },
  loginLink: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  loginText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    letterSpacing: 2,
    fontWeight: '600',
  },
  previewLink: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADII.full,
  },
  previewText: {
    ...TYPOGRAPHY.label,
    color: COLORS.primary,
    letterSpacing: 1,
    fontWeight: '600',
  },
});
