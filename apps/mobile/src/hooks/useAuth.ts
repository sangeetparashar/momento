import { useCallback, useEffect, useRef } from 'react';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { queryClient } from '@/providers/QueryProvider';

// Re-export for convenience
export { usePrivyGuard };

/**
 * Safe auth hook that works in both dev builds (with Privy) and Expo Go (without).
 * In Expo Go, returns mock values so the app runs in guest/preview mode.
 *
 * IMPORTANT: This is NOT a conditional hook. It always calls usePrivy when available,
 * determined at module level by whether PrivyGuard rendered the real PrivyProvider.
 * The branching happens in PrivyGuard (component tree), not here.
 */
let _privyHooks: {
  usePrivy: any;
  useLoginWithOAuth: any;
  useEmbeddedSolanaWallet: any;
  useLoginWithSiws: any;
} | false | null = null;

function getPrivyHooks() {
  if (_privyHooks === null) {
    try {
      const privy = require('@privy-io/expo');
      _privyHooks = {
        usePrivy: privy.usePrivy,
        useLoginWithOAuth: privy.useLoginWithOAuth,
        useEmbeddedSolanaWallet: privy.useEmbeddedSolanaWallet,
        useLoginWithSiws: privy.useLoginWithSiws,
      };
    } catch {
      _privyHooks = false;
    }
  }
  return _privyHooks;
}

let _phantomHook: any = null;
function getPhantomHook() {
  if (_phantomHook === null) {
    try {
      const connectors = require('@privy-io/expo/connectors');
      _phantomHook = connectors.usePhantomDeeplinkWalletConnector;
    } catch {
      _phantomHook = false;
    }
  }
  return _phantomHook;
}

const GUEST_AUTH = {
  isReady: true,
  user: null,
  login: async (_provider?: 'google' | 'instagram') => {
    console.warn('[useAuth] Privy not available in Expo Go — use a development build.');
  },
  loginWithWallet: async () => {
    console.warn('[useAuth] Privy not available in Expo Go — use a development build.');
  },
  generateSiwsMessage: async () => ({ message: '' }),
  siwsLogin: async () => {},
  logout: async () => {},
  getAccessToken: async () => null,
  walletAddress: null as string | null,
  walletStatus: 'disconnected' as string,
  getWalletProvider: async () => null as any,
};

/**
 * Must only be called from components inside PrivyGuard.
 * When Privy is unavailable (Expo Go), returns guest state.
 * When Privy is available (dev build), delegates to real Privy hooks.
 */
export function useAuth() {
  const { isPrivyAvailable } = usePrivyGuard();
  const creatingRef = useRef(false);

  if (!isPrivyAvailable) {
    return GUEST_AUTH;
  }

  const hooks = getPrivyHooks();
  if (!hooks) return GUEST_AUTH;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privy = hooks.usePrivy();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { login: oauthLogin } = hooks.useLoginWithOAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const siws = hooks.useLoginWithSiws();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const solanaWallet = hooks.useEmbeddedSolanaWallet({
    onCreateWalletSuccess: (wallet: any) => {
      console.log('[useAuth] Solana wallet created successfully:', wallet?.address);
      creatingRef.current = false;
    },
    onCreateWalletError: (error: Error) => {
      console.warn('[useAuth] Solana wallet creation failed:', error.message);
      creatingRef.current = false;
    },
  });

  // Auto-create wallet when user is logged in but wallet doesn't exist yet.
  // Skip if already attempted (creatingRef) to avoid retrying on 'error' status
  // caused by the wallet already existing (race between SDK connect and our effect).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (
      privy.user &&
      solanaWallet.status === 'not-created' &&
      !creatingRef.current
    ) {
      // Small delay to let the SDK finish connecting an existing wallet
      const timer = setTimeout(() => {
        if (creatingRef.current) return;
        console.log('[useAuth] User logged in but no Solana wallet — creating...');
        creatingRef.current = true;
        solanaWallet.create({ recoveryMethod: 'privy' }).catch((err: any) => {
          // "already exists" is expected if SDK connected between our check and create call
          if (err?.message?.includes('already exists')) {
            console.log('[useAuth] Wallet already exists — skipping creation');
          } else {
            console.warn('[useAuth] Wallet create() rejected:', err?.message || err);
          }
          creatingRef.current = false;
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [privy.user, solanaWallet.status]);

  // Log wallet status changes for debugging
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('[useAuth] Wallet status:', solanaWallet.status);
    if (solanaWallet.status === 'connected' && solanaWallet.wallets?.length > 0) {
      console.log('[useAuth] Wallet address:', solanaWallet.wallets[0].address);
    }
    if (solanaWallet.status === 'error') {
      console.warn('[useAuth] Wallet error (transient on cold start):', (solanaWallet as any).error);
    }
  }, [solanaWallet.status]);

  const walletAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.length > 0
      ? solanaWallet.wallets[0].address
      : null;

  /**
   * Returns the Privy Solana provider for signing transactions.
   * The provider supports signAndSendTransaction with both legacy
   * Transaction and VersionedTransaction objects.
   */
  const getWalletProvider = async () => {
    if (
      solanaWallet.status !== 'connected' ||
      !solanaWallet.wallets?.length
    ) {
      return null;
    }
    try {
      return await solanaWallet.wallets[0].getProvider();
    } catch (err: any) {
      console.warn('[useAuth] getProvider failed:', err?.message);
      return null;
    }
  };

  /**
   * Login with an external Solana wallet via SIWS (Sign In With Solana).
   * Takes the wallet address, a signMessage function, and optional wallet metadata.
   * Works with both Phantom deeplink and MWA (Mobile Wallet Adapter).
   */
  const loginWithWallet = async (
    externalAddress: string,
    signMessage: (message: string) => Promise<{ signature: string }>,
    walletMeta?: { walletClientType?: string; connectorType?: string },
  ) => {
    console.log('[useAuth] Starting SIWS login for wallet:', externalAddress);

    // 1. Generate the SIWS message
    const { message } = await siws.generateMessage({
      wallet: { address: externalAddress },
      from: {
        domain: 'momento.app',
        uri: 'https://momento.app',
      },
    });

    // 2. Sign with the external wallet
    const { signature } = await signMessage(message);

    // 3. Login via Privy SIWS
    await siws.login({
      signature,
      message,
      wallet: {
        walletClientType: walletMeta?.walletClientType ?? 'phantom',
        connectorType: walletMeta?.connectorType ?? 'deeplink',
      },
    });

    console.log('[useAuth] SIWS login complete');
  };

  return {
    isReady: privy.isReady,
    user: privy.user,
    login: async (provider: 'google' | 'instagram' = 'google') => {
      await oauthLogin({ provider });
    },
    loginWithWallet,
    /** Generate a SIWS message for an external wallet address. */
    generateSiwsMessage: siws.generateMessage,
    /** Complete SIWS login with a pre-signed message. */
    siwsLogin: siws.login,
    logout: async () => {
      // Cancel all in-flight queries BEFORE logout to prevent
      // "query dehydrated as pending ended up rejected" errors.
      // Queries like walletBalance will get 401 after auth is cleared.
      queryClient.cancelQueries();
      queryClient.clear();
      await privy.logout();
    },
    getAccessToken: async () => null, // handled by AuthBridge
    walletAddress,
    walletStatus: solanaWallet.status,
    getWalletProvider,
  };
}
