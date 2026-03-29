import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

// Dynamically load the Phantom connector to avoid crashes in Expo Go
let usePhantomConnector: any = null;
try {
  const connectors = require('@privy-io/expo/connectors');
  usePhantomConnector = connectors.usePhantomDeeplinkWalletConnector;
} catch {
  // Not available in Expo Go
}

function PhantomWalletLogin({ onSuccess }: { onSuccess: () => void }) {
  const auth = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  // Use the Phantom deeplink connector
  const phantom = usePhantomConnector?.({
    appUrl: 'https://momento.app',
    redirectUri: 'momento:///',
    autoReconnect: false,
  });

  const handleConnect = useCallback(async () => {
    if (!phantom) {
      Alert.alert('Phantom Not Available', 'Phantom wallet connector could not be loaded.');
      return;
    }

    try {
      setIsConnecting(true);

      // Step 1: Connect to Phantom (opens Phantom app)
      await phantom.connect();

      if (!phantom.address) {
        throw new Error('No wallet address returned from Phantom');
      }

      // Step 2: SIWS login through Privy
      await auth.loginWithWallet(phantom.address, phantom.signMessage);

      onSuccess();
    } catch (error: any) {
      console.warn('[WalletLogin] Failed:', error?.message || error);
      if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
        // User cancelled — do nothing
      } else {
        Alert.alert('Wallet Login Failed', error?.message || 'Could not connect wallet. Make sure Phantom is installed.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [phantom, auth, onSuccess]);

  if (!usePhantomConnector) return null;

  return (
    <TouchableOpacity
      onPress={handleConnect}
      style={styles.walletButton}
      activeOpacity={0.7}
      disabled={isConnecting}
    >
      {isConnecting ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
          <Text style={styles.walletButtonText}>CONNECT SOLANA WALLET</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { isPrivyAvailable } = usePrivyGuard();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAuth = useCallback(async () => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      setIsAuthenticating(true);
      await auth.login();
      queryClient.invalidateQueries();
      // Route back to index — it handles profile check → funding → home
      router.replace('/');
    } catch (error: any) {
      setIsAuthenticating(false);
      Alert.alert('Login Error', error?.message || String(error));
    }
  }, [auth, router, isPrivyAvailable, queryClient]);

  const handleWalletSuccess = useCallback(() => {
    queryClient.invalidateQueries();
    router.replace('/');
  }, [router, queryClient]);

  // Show loading screen if auth is in progress OR user is already authenticated
  // (handles re-mount after OAuth callback where local state resets but auth.user is set)
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
          <TouchableOpacity onPress={handleAuth} style={styles.signUpButton} activeOpacity={0.7}>
            <Ionicons name="logo-google" size={20} color={COLORS.background} style={{ marginRight: SPACING.sm }} />
            <Text style={styles.signUpText}>CONTINUE WITH GOOGLE</Text>
          </TouchableOpacity>

          {/* Wallet login — Phantom deeplink */}
          {isPrivyAvailable && usePhantomConnector && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <PhantomWalletLogin onSuccess={handleWalletSuccess} />
            </>
          )}

          <TouchableOpacity onPress={handleAuth} style={styles.loginLink} activeOpacity={0.7}>
            <Text style={styles.loginText}>ALREADY HAVE AN ACCOUNT? LOGIN</Text>
          </TouchableOpacity>
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
    flexDirection: 'row',
    justifyContent: 'center',
    // 3D effect
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  signUpText: {
    ...TYPOGRAPHY.body,
    color: COLORS.background,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 16,
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textTertiary,
    marginHorizontal: SPACING.md,
    fontSize: 13,
  },
  // Wallet button
  walletButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    gap: SPACING.sm,
  },
  walletButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1.5,
    fontSize: 14,
  },
  loginLink: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  loginText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
});
