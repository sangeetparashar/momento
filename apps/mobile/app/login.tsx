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
let usePhantomConnector: any = null;
try {
  const connectors = require('@privy-io/expo/connectors');
  usePhantomConnector = connectors.usePhantomDeeplinkWalletConnector;
} catch { /* Not available in Expo Go */ }

// Raw Privy client + SIWS message builder from SDK
let usePrivyClient: any = null;
let createSiwsMessage: any = null;
try {
  const privy = require('@privy-io/expo');
  usePrivyClient = privy.usePrivyClient;
} catch { /* Not available */ }
try {
  const core = require('@privy-io/js-sdk-core');
  createSiwsMessage = core.createSiwsMessage;
} catch { /* Not available */ }

// AsyncStorage keys for persisting SIWS state across deeplink round-trips
const SIWS_PENDING_KEY = 'momento_siws_pending';     // 'connect' | 'sign'
const SIWS_MESSAGE_KEY = 'momento_siws_message';
const SIWS_ADDRESS_KEY = 'momento_siws_address';

async function clearSiwsState() {
  await AsyncStorage.multiRemove([SIWS_PENDING_KEY, SIWS_MESSAGE_KEY, SIWS_ADDRESS_KEY]);
}

// ── Helper: run the SIWS flow once we have an address ───────────────────────
// Extracted so it can be called from useEffect or from the recovery poll.
async function runSiwsFlow(
  address: string,
  phantom: any,
  privyClient: any,
  setStage: (s: string) => void,
  onSuccess: () => void,
) {
  const siwsApi = privyClient.auth?.siws ?? privyClient.siws;

  console.log('[WalletLogin] === Starting SIWS flow for:', address);

  // 1. Fetch nonce
  const { nonce } = await siwsApi.fetchNonce({ address });
  console.log('[WalletLogin] Got nonce:', nonce?.slice(0, 20) + '...');

  // 2. Build SIWS message using Privy's exact format
  const message = createSiwsMessage({
    address,
    nonce,
    domain: 'momento.app',
    uri: 'https://momento.app',
  });
  console.log('[WalletLogin] SIWS message built, length:', message.length);

  // 3. Persist for recovery
  await AsyncStorage.setItem(SIWS_MESSAGE_KEY, message);
  await AsyncStorage.setItem(SIWS_ADDRESS_KEY, address);
  await AsyncStorage.setItem(SIWS_PENDING_KEY, 'sign');

  // 4. Open Phantom for signing (second deeplink)
  console.log('[WalletLogin] Opening Phantom for signing...');
  setStage('signing');
  const { signature } = await phantom.signMessage(message);

  console.log('[WalletLogin] Got signature, type:', typeof signature, 'len:', String(signature).length);
  console.log('[WalletLogin] Signature preview:', String(signature).slice(0, 60));

  // 5. Login via raw Privy API
  setStage('logging-in');
  console.log('[WalletLogin] Calling siwsApi.login...');
  try {
    await siwsApi.login({
      message,
      signature,
      walletClientType: 'phantom',
      connectorType: 'deeplink',
    });
  } catch (loginErr: any) {
    console.error('[WalletLogin] LOGIN FAILED:', JSON.stringify({
      msg: loginErr?.message,
      status: loginErr?.status,
      body: JSON.stringify(loginErr?.body)?.slice(0, 300),
      code: loginErr?.code,
    }));
    throw loginErr;
  }

  console.log('[WalletLogin] === Login successful! ===');
  await clearSiwsState();
  onSuccess();
}

// ── Phantom wallet login component ──────────────────────────────────────────
function PhantomWalletLogin({ onSuccess }: { onSuccess: () => void }) {
  const [stage, setStage] = useState<string>('idle');
  const busyRef = useRef(false);

  const phantom = usePhantomConnector?.({
    appUrl: 'https://momento.app',
    redirectUri: 'momento:///',
    autoReconnect: true,
  });

  const privyClient = usePrivyClient?.();

  // ── Log phantom state changes for debugging ─────────────────────────
  useEffect(() => {
    console.log('[WalletLogin] phantom.address changed:', phantom?.address ?? 'undefined');
    console.log('[WalletLogin] phantom.isConnected:', phantom?.isConnected);
  }, [phantom?.address, phantom?.isConnected]);

  // ── Core effect: when address appears AND we have a pending connect ──
  useEffect(() => {
    if (!phantom?.address || busyRef.current) return;

    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      console.log('[WalletLogin] Address useEffect fired. address:', phantom.address, 'pending:', pending, 'busy:', busyRef.current);

      if (pending !== 'connect') return;
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        await runSiwsFlow(phantom.address, phantom, privyClient, setStage, () => {
          busyRef.current = false;
          onSuccess();
        });
      } catch (error: any) {
        console.warn('[WalletLogin] SIWS flow failed:', error?.message || error);
        await clearSiwsState();
        busyRef.current = false;
        setStage('idle');
        if (!error?.message?.includes('cancel')) {
          Alert.alert('Wallet Login Failed', error?.message || 'Could not complete sign-in.');
        }
      }
    })();
  }, [phantom?.address]);

  // ── On mount: recover from interrupted flow after cold start ──────
  // The app may have been killed while Phantom was open. Poll for
  // phantom.address to appear (autoReconnect / getInitialURL).
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      console.log('[WalletLogin] Mount recovery check. pending:', pending, 'phantom.address:', phantom?.address);

      if (!pending) return;

      // Show connecting state while we wait
      setStage(pending === 'sign' ? 'signing' : 'connecting');

      // If the address is already available, the address-useEffect handles it.
      // If not, poll every 500ms for up to 5 seconds waiting for autoReconnect.
      if (!phantom?.address) {
        console.log('[WalletLogin] Waiting for phantom.address via autoReconnect...');
        let attempts = 0;
        pollTimer = setInterval(async () => {
          attempts++;
          console.log('[WalletLogin] Poll #' + attempts + ' phantom.address:', phantom?.address);

          if (phantom?.address && !cancelled && !busyRef.current) {
            clearInterval(pollTimer!);
            pollTimer = null;
            busyRef.current = true;

            // If we were in 'sign' state, restart from 'connect' (need new nonce)
            if (pending === 'sign') {
              await AsyncStorage.setItem(SIWS_PENDING_KEY, 'connect');
            }

            try {
              await runSiwsFlow(phantom.address, phantom, privyClient, setStage, () => {
                busyRef.current = false;
                onSuccess();
              });
            } catch (error: any) {
              console.warn('[WalletLogin] Recovery SIWS failed:', error?.message);
              await clearSiwsState();
              busyRef.current = false;
              setStage('idle');
              if (!error?.message?.includes('cancel')) {
                Alert.alert('Wallet Login Failed', error?.message || 'Please try again.');
              }
            }
          } else if (attempts >= 10) {
            clearInterval(pollTimer!);
            pollTimer = null;
            console.warn('[WalletLogin] Timed out waiting for phantom.address');
            await clearSiwsState();
            setStage('idle');
          }
        }, 500);
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []); // Only run on mount

  // ── Tap handler: start the connect flow ───────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!phantom || !privyClient || !createSiwsMessage) {
      Alert.alert('Not Available', 'Wallet connector not loaded. Use a dev build.');
      return;
    }

    try {
      setStage('connecting');
      await AsyncStorage.setItem(SIWS_PENDING_KEY, 'connect');
      console.log('[WalletLogin] Opening Phantom for connect...');
      await phantom.connect();
      // If this resolves, the address useEffect will handle the rest
    } catch (error: any) {
      console.warn('[WalletLogin] Connect failed:', error?.message || error);
      await clearSiwsState();
      setStage('idle');
      if (!error?.message?.includes('cancel')) {
        Alert.alert('Connection Failed', 'Could not connect to Phantom.');
      }
    }
  }, [phantom, privyClient]);

  if (!usePhantomConnector || !usePrivyClient || !createSiwsMessage) return null;

  const labels: Record<string, string> = {
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
            {labels[stage] || 'CONNECTING...'}
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
          <Text style={styles.walletButtonText}>{labels.idle}</Text>
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
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  topSpacer: { flex: 2 },
  logoContainer: { alignItems: 'center' },
  subtitle: { ...TYPOGRAPHY.label, color: COLORS.textSecondary, letterSpacing: 4, marginTop: SPACING.md, textAlign: 'center' },
  bottomSpacer: { flex: 3 },
  actions: { alignItems: 'center', paddingBottom: SPACING.xl },
  signUpButton: {
    backgroundColor: COLORS.primary, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8,
    elevation: 8, borderBottomWidth: 3, borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  signUpText: { ...TYPOGRAPHY.body, color: COLORS.background, fontWeight: '800', letterSpacing: 2, fontSize: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: SPACING.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dividerText: { ...TYPOGRAPHY.body, color: COLORS.textTertiary, marginHorizontal: SPACING.md, fontSize: 13 },
  walletButton: {
    backgroundColor: COLORS.surface, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primary + '40', gap: SPACING.sm,
  },
  walletButtonText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700', letterSpacing: 1.5, fontSize: 14 },
  loginLink: { marginTop: SPACING.lg, paddingVertical: SPACING.sm },
  loginText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, letterSpacing: 1.5, fontWeight: '600', fontSize: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.md },
});
