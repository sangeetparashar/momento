import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { isPrivyAvailable } = usePrivyGuard();

  const handleSignUp = useCallback(async () => {
    if (!isPrivyAvailable) {
      Alert.alert(
        'Development Build Required',
        'Privy auth requires a development build. Expo Go does not support native crypto modules.\n\nRun: npx expo run:android',
      );
      return;
    }
    try {
      await login();
      router.replace('/(tabs)/home');
    } catch (error) {
      // Login was cancelled or failed - user stays on login screen
    }
  }, [login, router, isPrivyAvailable]);

  const handleLogin = useCallback(async () => {
    if (!isPrivyAvailable) {
      Alert.alert(
        'Development Build Required',
        'Privy auth requires a development build. Expo Go does not support native crypto modules.\n\nRun: npx expo run:android',
      );
      return;
    }
    try {
      await login();
      router.replace('/(tabs)/home');
    } catch (error) {
      // Login was cancelled or failed
    }
  }, [login, router, isPrivyAvailable]);

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
          <Text style={styles.logo}>M O M E N T O</Text>
          <Text style={styles.subtitle}>THE STOCK MARKET FOR CULTURE</Text>
        </View>

        {/* Spacer */}
        <View style={styles.bottomSpacer} />

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable onPress={handleSignUp} style={styles.signUpButton}>
            <Text style={styles.signUpText}>SIGN UP</Text>
          </Pressable>

          <Pressable onPress={handleLogin} style={styles.loginLink}>
            <Text style={styles.loginText}>OR LOGIN</Text>
          </Pressable>

          {!isPrivyAvailable && (
            <Pressable onPress={handlePreview} style={styles.previewLink}>
              <Text style={styles.previewText}>PREVIEW MODE (EXPO GO)</Text>
            </Pressable>
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
