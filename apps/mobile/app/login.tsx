import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

// ── Phantom deeplink connector ──────────────────────────────────────────────
// Dynamically load so the app doesn't crash in Expo Go (no native modules).
let usePhantomConnector: any = null;
try {
  const connectors = require('@privy-io/expo/connectors');
  usePhantomConnector = connectors.usePhantomDeeplinkWalletConnector;
} catch {
  // Not available in Expo Go
}

// Access the raw Privy client for manual SIWS (nonce persists server-side,
// not in hook state — survives app backgrounding between deeplinks).
let usePrivyClient: any = null;
let createSiwsMessage: any = null;
try {
  const privy = require('@privy-io/expo');
  usePrivyClient = privy.usePrivyClient;
} catch {
  // Not available
}
try {
  const core = require('@privy-io/js-sdk-core');
  createSiwsMessage = core.createSiwsMessage;
} catch {
  // Not available
}

// AsyncStorage keys for persisting SIWS state across deeplink round-trips
const SIWS_PENDING_KEY = 'momento_siws_pending';     // 'connect' | 'sign'
const SIWS_MESSAGE_KEY = 'momento_siws_message';      // the SIWS message text
const SIWS_ADDRESS_KEY = 'momento_siws_address';      // wallet address

async function clearSiwsState() {
  await AsyncStorage.multiRemove([SIWS_PENDING_KEY, SIWS_MESSAGE_KEY, SIWS_ADDRESS_KEY]);
}

// ── Phantom wallet login component ──────────────────────────────────────────
//
// Flow (two deeplink round-trips):
//
//   1. phantom.connect() → opens Phantom → user approves → redirects back
//      - Connector processes URL, sets phantom.address
//      - We detect address in useEffect
//      - Generate SIWS message via Privy, persist to AsyncStorage
//      - Call phantom.signMessage(message) → opens Phantom again
//
//   2. phantom.signMessage() → opens Phantom → user signs → redirects back
//      - Connector processes URL, resolves signMessage promise
//      - We call privyClient.siws.login() with the persisted message + signature
//      - Login complete!
//
// The raw privyClient.siws.login() validates the nonce server-side (not in
// React hook state), so it survives app backgrounding/foregrounding.

function PhantomWalletLogin({ onSuccess }: { onSuccess: () => void }) {
  const [stage, setStage] = useState<'idle' | 'connecting' | 'signing' | 'logging-in'>('idle');
  const busyRef = useRef(false); // prevent double-execution

  // Phantom connector
  const phantom = usePhantomConnector?.({
    appUrl: 'https://momento.app',
    redirectUri: 'momento:///',
    autoReconnect: true,
  });

  // Raw Privy client for manual SIWS
  const privyClient = usePrivyClient?.();

  // ── After phantom.connect() returns: address is set ───────────────────
  // Generate SIWS message, persist it, then call signMessage.
  useEffect(() => {
    if (!phantom?.address || busyRef.current) return;

    // Check if we're waiting for the connect step
    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      if (pending !== 'connect') return;
      if (busyRef.current) return;
      busyRef.current = true;

      console.log('[WalletLogin] Address detected:', phantom.address);
      console.log('[WalletLogin] Pending state:', pending, 'busyRef:', busyRef.current);
      console.log('[WalletLogin] privyClient keys:', Object.keys(privyClient || {}));
      console.log('[WalletLogin] privyClient.auth keys:', Object.keys(privyClient?.auth || {}));
      console.log('[WalletLogin] createSiwsMessage available:', !!createSiwsMessage);
      setStage('signing');

      try {
        // Fetch nonce from Privy server and build SIWS message
        // siws API lives under privyClient.auth.siws (AuthApi → SiwsApi)
        const siwsApi = privyClient.auth?.siws ?? privyClient.siws;
        const { nonce } = await siwsApi.fetchNonce({ address: phantom.address });

        // Use Privy's own createSiwsMessage to guarantee the exact format
        // the server expects (statement, resources, etc.)
        const message = createSiwsMessage({
          address: phantom.address,
          nonce,
          domain: 'momento.app',
          uri: 'https://momento.app',
        });
        console.log('[WalletLogin] SIWS message:', message);

        // Persist message so it survives the second deeplink round-trip
        await AsyncStorage.setItem(SIWS_MESSAGE_KEY, message);
        await AsyncStorage.setItem(SIWS_ADDRESS_KEY, phantom.address);
        await AsyncStorage.setItem(SIWS_PENDING_KEY, 'sign');

        console.log('[WalletLogin] SIWS message generated, opening Phantom for signing...');

        // This opens Phantom again via deeplink. The promise resolves
        // when Phantom redirects back with the signed message.
        const { signature } = await phantom.signMessage(message);

        console.log('[WalletLogin] Signature received:', JSON.stringify(signature).slice(0, 80));
        console.log('[WalletLogin] Signature type:', typeof signature);
        console.log('[WalletLogin] Message being sent to login:', JSON.stringify(message).slice(0, 200));
        setStage('logging-in');

        // Login via raw Privy API (server-side nonce validation)
        const siwsLoginApi = privyClient.auth?.siws ?? privyClient.siws;
        try {
          await siwsLoginApi.login({
            message,
            signature,
            walletClientType: 'phantom',
            connectorType: 'deeplink',
          });
        } catch (loginErr: any) {
          console.error('[WalletLogin] LOGIN ERROR DETAILS:', JSON.stringify({
            message: loginErr?.message,
            status: loginErr?.status,
            body: loginErr?.body,
            code: loginErr?.code,
            name: loginErr?.name,
          }));
          throw loginErr;
        }

        console.log('[WalletLogin] Login successful!');
        await clearSiwsState();
        busyRef.current = false;
        onSuccess();
      } catch (error: any) {
        console.warn('[WalletLogin] SIWS flow failed:', error?.message || error);
        await clearSiwsState();
        busyRef.current = false;
        setStage('idle');

        if (!error?.message?.includes('cancel')) {
          Alert.alert(
            'Wallet Login Failed',
            error?.message || 'Could not complete sign-in. Please try again.',
          );
        }
      }
    })();
  }, [phantom?.address]);

  // ── On mount: check for interrupted sign flow ─────────────────────────
  // If the app was killed during the signMessage deeplink, we need to retry.
  useEffect(() => {
    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      if (pending === 'sign' && phantom?.address) {
        console.log('[WalletLogin] Resuming interrupted sign flow');
        // The connector should auto-reconnect and have the address.
        // Re-trigger the flow by setting pending back to 'connect'
        // so the address useEffect picks it up.
        await AsyncStorage.setItem(SIWS_PENDING_KEY, 'connect');
        setStage('signing');
      } else if (pending === 'connect') {
        // Waiting for connect callback — show connecting state
        setStage('connecting');
      }
    })();
  }, [phantom?.address]);

  // ── Tap handler: start the connect flow ───────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!phantom || !privyClient || !createSiwsMessage) {
      Alert.alert('Not Available', 'Wallet connector could not be loaded. Make sure you are using a dev build.');
      return;
    }

    try {
      setStage('connecting');
      await AsyncStorage.setItem(SIWS_PENDING_KEY, 'connect');

      console.log('[WalletLogin] Opening Phantom for connect...');
      await phantom.connect();

      // If connect() resolves immediately (unlikely with deeplinks),
      // the useEffect above will handle the rest.
    } catch (error: any) {
      console.warn('[WalletLogin] Connect failed:', error?.message || error);
      await clearSiwsState();
      setStage('idle');

      if (!error?.message?.includes('cancel')) {
        Alert.alert(
          'Connection Failed',
          'Could not connect to Phantom. Make sure the app is installed.',
        );
      }
    }
  }, [phantom, privyClient]);

  if (!usePhantomConnector || !usePrivyClient || !createSiwsMessage) return null;

  const stageLabels = {
    idle: 'CONNECT SOLANA WALLET',
    connecting: 'OPENING PHANTOM...',
    signing: 'SIGN TO VERIFY...',
    'logging-in': 'COMPLETING LOGIN...',
  };

  return (
    <TouchableOpacity
      onPress={handleConnect}
      style={styles.walletButton}
      activeOpacity={0.7}
      disabled={stage !== 'idle'}
    >
      {stage !== 'idle' ? (
        <>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={[styles.walletButtonText, { marginLeft: SPACING.sm }]}>
            {stageLabels[stage]}
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
          <Text style={styles.walletButtonText}>{stageLabels.idle}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Main login screen ────────────────────────────────────────────────────────

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

  // Show loading when auth is in progress or user is already authenticated
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
        <View style={styles.topSpacer} />

        <View style={styles.logoContainer}>
          <MomentoLogo size={80} showText />
          <Text style={styles.subtitle}>THE STOCK MARKET FOR CULTURE</Text>
        </View>

        <View style={styles.bottomSpacer} />

        <View style={styles.actions}>
          <TouchableOpacity onPress={handleAuth} style={styles.signUpButton} activeOpacity={0.7}>
            <Ionicons name="logo-google" size={20} color={COLORS.background} style={{ marginRight: SPACING.sm }} />
            <Text style={styles.signUpText}>CONTINUE WITH GOOGLE</Text>
          </TouchableOpacity>

          {/* Wallet login — Phantom deeplink with manual SIWS + nonce persistence */}
          {isPrivyAvailable && usePhantomConnector && usePrivyClient && createSiwsMessage && (
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
