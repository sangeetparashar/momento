import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, MomentoLogo } from '@/components/primitives';
import { ComingSoonModal } from '@/components/features';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

// ── Phantom deeplink connector ──────────────────────────────────────────────
let usePhantomConnector: any = null;
try {
  const connectors = require('@privy-io/expo/connectors');
  usePhantomConnector = connectors.usePhantomDeeplinkWalletConnector;
} catch { /* Not available in Expo Go */ }

// AsyncStorage key for persisting connect state across deeplink round-trips
const SIWS_PENDING_KEY = 'momento_siws_pending'; // 'connect'

// ── Phantom wallet login component ──────────────────────────────────────────
function PhantomWalletLogin({ onSuccess }: { onSuccess: () => void }) {
  const [stage, setStage] = useState<string>('idle');
  const busyRef = useRef(false);
  const auth = useAuth();

  const phantom = usePhantomConnector?.({
    appUrl: 'https://momento.app',
    redirectUri: 'momento:///',
    autoReconnect: true,
  });

  // ── Log phantom state changes for debugging ─────────────────────────
  useEffect(() => {
    console.log('[WalletLogin] phantom.address changed:', phantom?.address ?? 'undefined');
    console.log('[WalletLogin] phantom.isConnected:', phantom?.isConnected);
  }, [phantom?.address, phantom?.isConnected]);

  // ── Core effect: when address appears AND we have a pending connect, run SIWS ──
  useEffect(() => {
    if (!phantom?.address || busyRef.current) return;

    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      console.log('[WalletLogin] Address useEffect fired. address:', phantom.address, 'pending:', pending, 'busy:', busyRef.current);

      if (pending !== 'connect') return;
      if (busyRef.current) return;
      busyRef.current = true;

      try {
        setStage('signing');
        console.log('[WalletLogin] === Starting SIWS via useAuth.loginWithWallet ===');
        console.log('[WalletLogin] Address:', phantom.address);

        // Use useAuth's loginWithWallet — the exact flow Privy designed.
        // It calls siws.generateMessage() → signMessage → siws.login() internally.
        await auth.loginWithWallet(phantom.address, async (message: string) => {
          console.log('[WalletLogin] signMessage callback called, message length:', message.length);
          console.log('[WalletLogin] Message preview:', message.slice(0, 150));
          console.log('[WalletLogin] Opening Phantom for signing...');
          setStage('signing');
          const result = await phantom.signMessage(message);
          console.log('[WalletLogin] Got signature, type:', typeof result.signature, 'len:', String(result.signature).length);
          console.log('[WalletLogin] Signature preview:', String(result.signature).slice(0, 60));
          return result;
        });

        console.log('[WalletLogin] === Login successful! ===');
        await AsyncStorage.removeItem(SIWS_PENDING_KEY);
        setStage('idle');
        busyRef.current = false;
        onSuccess();
      } catch (error: any) {
        console.warn('[WalletLogin] SIWS flow failed:', error?.message || error);
        console.warn('[WalletLogin] Error details:', JSON.stringify({
          msg: error?.message,
          status: error?.status,
          body: JSON.stringify(error?.body)?.slice(0, 300),
          code: error?.code,
        }));
        await AsyncStorage.removeItem(SIWS_PENDING_KEY);
        busyRef.current = false;
        setStage('idle');
        if (!error?.message?.includes('cancel')) {
          Alert.alert('Wallet Login Failed', error?.message || 'Could not complete sign-in.');
        }
      }
    })();
  }, [phantom?.address]);

  // ── On mount: check for interrupted flow from cold start ──────────
  useEffect(() => {
    (async () => {
      const pending = await AsyncStorage.getItem(SIWS_PENDING_KEY);
      console.log('[WalletLogin] Mount recovery check. pending:', pending, 'phantom.address:', phantom?.address);

      if (pending === 'connect') {
        // Show connecting state — the address-useEffect above will handle when phantom reconnects
        setStage('connecting');
      }

      // If there was a pending 'connect' but no phantom.address, it means the app
      // was killed during Phantom's connect flow. The phantom connector's autoReconnect
      // will eventually populate the address if the connection succeeded.
      // We just wait for the address-useEffect to fire.
    })();
  }, []); // Only run on mount

  // ── Tap handler: start the connect flow ───────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!phantom) {
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
      await AsyncStorage.removeItem(SIWS_PENDING_KEY);
      setStage('idle');
      if (!error?.message?.includes('cancel')) {
        Alert.alert('Connection Failed', 'Could not connect to Phantom.');
      }
    }
  }, [phantom]);

  if (!usePhantomConnector) return null;

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

// ── MWA (Mobile Wallet Adapter) login component ─────────────────────────────
// Uses Solana's native MWA protocol: single session for connect + sign.
// On Android, this shows a system bottom sheet with installed wallets.
// On iOS, it uses ASWebAuthenticationSession (browser-based sheet).

let _mwaTransact: any = null;
let _mwaAvailable: boolean | null = null;
function getMwaTransact() {
  if (_mwaAvailable === null) {
    try {
      const mwa = require('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
      _mwaTransact = mwa.transact;
      _mwaAvailable = true;
    } catch {
      _mwaAvailable = false;
    }
  }
  return _mwaTransact;
}

function MWAWalletLogin({ onSuccess }: { onSuccess: () => void }) {
  const [stage, setStage] = useState<string>('idle');
  const auth = useAuth();

  const handleConnect = useCallback(async () => {
    const transact = getMwaTransact();
    if (!transact) {
      Alert.alert('Not Available', 'Mobile Wallet Adapter is not available on this device.');
      return;
    }

    setStage('connecting');

    try {
      // Single MWA session: authorize + sign SIWS message without leaving the app
      const { address, message, signature } = await transact(async (wallet: any) => {
        // Step 1: Authorize — shows OS wallet picker, user selects & approves
        console.log('[MWA] Requesting authorization...');
        const authResult = await wallet.authorize({
          identity: {
            name: 'Momento',
            uri: 'https://momento.app',
          },
          chain: 'solana:mainnet',
        });

        const account = authResult.accounts[0];
        if (!account) throw new Error('No wallet account returned');

        // Decode base64 address to base58 Solana address
        const { PublicKey } = require('@solana/web3.js');
        const pubkeyBytes = Uint8Array.from(atob(account.address), (c: string) => c.charCodeAt(0));
        const address = new PublicKey(pubkeyBytes).toBase58();
        console.log('[MWA] Authorized. Address:', address);

        // Step 2: Generate SIWS message (Privy network call — session stays open)
        setStage('signing');
        console.log('[MWA] Generating SIWS message...');
        const { message } = await auth.generateSiwsMessage({
          wallet: { address },
          from: { domain: 'momento.app', uri: 'https://momento.app' },
        });
        console.log('[MWA] SIWS message generated, length:', message.length);

        // Step 3: Sign the SIWS message within the same wallet session
        console.log('[MWA] Requesting message signature...');
        const messageBytes = new TextEncoder().encode(message);
        const signedPayloads = await wallet.signMessages({
          addresses: [account.address],
          payloads: [messageBytes],
        });

        // Encode signature as base58 (standard Solana signature format)
        const bs58 = require('bs58');
        const signature = bs58.default
          ? bs58.default.encode(signedPayloads[0])
          : bs58.encode(signedPayloads[0]);
        console.log('[MWA] Signature obtained, length:', signature.length);

        return { address, message, signature };
      });

      // Step 4: Complete Privy SIWS login (MWA session closed, but we have everything)
      setStage('logging-in');
      console.log('[MWA] Completing SIWS login with Privy...');
      await auth.siwsLogin({
        signature,
        message,
        wallet: {
          walletClientType: 'mobile-wallet-adapter',
          connectorType: 'mobile-wallet-adapter',
        },
      });

      console.log('[MWA] Login complete!');
      setStage('idle');
      onSuccess();
    } catch (error: any) {
      console.warn('[MWA] Login failed:', error?.message || error);
      console.warn('[MWA] Error code:', error?.code);
      setStage('idle');

      // Don't show alert for user cancellation
      const msg = error?.message || '';
      const code = error?.code || '';
      if (msg.includes('cancel') || msg.includes('Cancel') ||
          code.includes('CANCEL') || code.includes('SESSION_CLOSED')) {
        return;
      }
      Alert.alert('Wallet Login Failed', msg || 'Could not complete sign-in.');
    }
  }, [auth, onSuccess]);

  if (!getMwaTransact()) return null;

  const labels: Record<string, string> = {
    idle: 'CONNECT SOLANA WALLET',
    connecting: 'SELECT WALLET...',
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

// ── Base (Ethereum) wallet login ────────────────────────────────────────────
// Wired to useAuth.loginWithEthWallet via SIWE. Currently shows a "coming
// soon" alert because external Base wallet connection (WalletConnect / Coinbase
// Wallet SDK) is not yet integrated. The SIWE flow itself is fully implemented
// and ready to wire up once an external EVM wallet connector is in place.
function BaseWalletLogin() {
  const handleConnect = useCallback(() => {
    Alert.alert(
      'Coming Soon',
      'External Base wallet connection (WalletConnect / Coinbase) is coming in the next release. OAuth users automatically get a Base wallet alongside their Solana wallet.',
    );
  }, []);

  return (
    <TouchableOpacity
      onPress={handleConnect}
      style={[styles.walletButton, styles.baseWalletButton]}
      activeOpacity={0.7}
    >
      <Ionicons name="wallet-outline" size={20} color="#0052FF" />
      <Text style={[styles.walletButtonText, styles.baseWalletButtonText]}>
        CONNECT BASE WALLET
      </Text>
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
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleAuth = useCallback(async (provider: 'google' | 'instagram' = 'google') => {
    try {
      if (!isPrivyAvailable) {
        Alert.alert('Dev Build Required', 'Privy auth requires a development build.');
        return;
      }
      setIsAuthenticating(true);
      await auth.login(provider);
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
          <TouchableOpacity onPress={() => handleAuth('google')} style={styles.signUpButton} activeOpacity={0.7}>
            <Ionicons name="logo-google" size={20} color={COLORS.background} style={{ marginRight: SPACING.sm }} />
            <Text style={styles.signUpText}>CONTINUE WITH GOOGLE</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowComingSoon(true)} style={[styles.signUpButton, styles.instagramButton]} activeOpacity={0.7}>
            <Ionicons name="logo-instagram" size={20} color={COLORS.background} style={{ marginRight: SPACING.sm }} />
            <Text style={styles.signUpText}>CONTINUE WITH INSTAGRAM</Text>
          </TouchableOpacity>

          {isPrivyAvailable && (getMwaTransact() || usePhantomConnector) && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              {/* MWA: single-session connect+sign (preferred on Android, works on iOS) */}
              {getMwaTransact() ? (
                <MWAWalletLogin onSuccess={handleWalletSuccess} />
              ) : (
                /* Fallback: Phantom deeplink (two round-trips) */
                <PhantomWalletLogin onSuccess={handleWalletSuccess} />
              )}
              {/* Base / Ethereum wallet login (placeholder until WalletConnect wired) */}
              <BaseWalletLogin />
            </>
          )}

          <TouchableOpacity onPress={() => handleAuth('google')} style={styles.loginLink} activeOpacity={0.7}>
            <Text style={styles.loginText}>ALREADY HAVE AN ACCOUNT? LOGIN</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ComingSoonModal
        visible={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        title="Coming Soon!"
        message="Instagram login will be available in the next release. Stay tuned!"
      />
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
  instagramButton: {
    marginTop: SPACING.sm,
    backgroundColor: '#E1306C',
    shadowColor: '#E1306C',
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: SPACING.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dividerText: { ...TYPOGRAPHY.body, color: COLORS.textTertiary, marginHorizontal: SPACING.md, fontSize: 13 },
  walletButton: {
    backgroundColor: COLORS.surface, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl,
    borderRadius: RADII.full, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primary + '40', gap: SPACING.sm,
  },
  walletButtonText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700', letterSpacing: 1.5, fontSize: 14 },
  baseWalletButton: {
    marginTop: SPACING.sm,
    borderColor: '#0052FF' + '60',
  },
  baseWalletButtonText: {
    color: '#0052FF',
  },
  loginLink: { marginTop: SPACING.lg, paddingVertical: SPACING.sm },
  loginText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, letterSpacing: 1.5, fontWeight: '600', fontSize: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.md },
});
