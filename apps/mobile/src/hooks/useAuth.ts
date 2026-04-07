import { useCallback, useEffect, useRef } from 'react';
import { usePrivyGuard } from '@/providers/PrivyGuard';
import { useChain } from '@/providers/ChainProvider';
import { queryClient } from '@/providers/QueryProvider';
import type { ChainType } from '@momento/shared';

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
  useEmbeddedEthereumWallet: any;
  useLoginWithSiws: any;
  useLoginWithSiwe: any;
} | false | null = null;

function getPrivyHooks() {
  if (_privyHooks === null) {
    try {
      const privy = require('@privy-io/expo');
      _privyHooks = {
        usePrivy: privy.usePrivy,
        useLoginWithOAuth: privy.useLoginWithOAuth,
        useEmbeddedSolanaWallet: privy.useEmbeddedSolanaWallet,
        useEmbeddedEthereumWallet: privy.useEmbeddedEthereumWallet,
        useLoginWithSiws: privy.useLoginWithSiws,
        useLoginWithSiwe: privy.useLoginWithSiwe,
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
  // Multi-chain (Base/ETH) fields
  ethWalletAddress: null as string | null,
  ethWalletStatus: 'disconnected' as string,
  getEthWalletProvider: async () => null as any,
  loginWithEthWallet: async () => {
    console.warn('[useAuth] Privy not available in Expo Go — use a development build.');
  },
  generateSiweMessage: async () => '',
  siweLogin: async () => {},
};

/**
 * Must only be called from components inside PrivyGuard.
 * When Privy is unavailable (Expo Go), returns guest state.
 * When Privy is available (dev build), delegates to real Privy hooks.
 */
export function useAuth() {
  const { isPrivyAvailable } = usePrivyGuard();
  const creatingRef = useRef(false);
  const ethCreatingRef = useRef(false);

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
  const siwe = hooks.useLoginWithSiwe({
    onSuccess: () => {
      console.log('[useAuth] SIWE login success');
    },
    onError: (err: any) => {
      console.warn('[useAuth] SIWE login error:', err?.message || err);
    },
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { setAvailableChains } = useChain();

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

  // ETH wallet hook takes NO callbacks/options in @privy-io/expo 0.63.9
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ethWallet = hooks.useEmbeddedEthereumWallet();

  // Auto-create Solana wallet when user is logged in but wallet doesn't exist yet.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (
      privy.user &&
      solanaWallet.status === 'not-created' &&
      !creatingRef.current
    ) {
      const timer = setTimeout(() => {
        if (creatingRef.current) return;
        console.log('[useAuth] User logged in but no Solana wallet — creating...');
        creatingRef.current = true;
        solanaWallet.create({ recoveryMethod: 'privy' }).catch((err: any) => {
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

  // ETH wallet doesn't have a `status` field — derive from `wallets.length`.
  // Auto-create when user is logged in but no ETH wallet exists yet.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const hasEthWallet = (ethWallet?.wallets?.length ?? 0) > 0;
    if (privy.user && !hasEthWallet && !ethCreatingRef.current) {
      // 2000ms delay (after Solana's 1500ms) to avoid hammering Privy on cold start.
      const timer = setTimeout(() => {
        if (ethCreatingRef.current) return;
        console.log('[useAuth] User logged in but no ETH wallet — creating...');
        ethCreatingRef.current = true;
        ethWallet
          .create()
          .then((res: any) => {
            console.log('[useAuth] ETH wallet created successfully:', res?.user?.id);
            ethCreatingRef.current = false;
          })
          .catch((err: any) => {
            if (err?.message?.includes('already exists')) {
              console.log('[useAuth] ETH wallet already exists — skipping creation');
            } else {
              console.warn('[useAuth] ETH wallet create() rejected:', err?.message || err);
            }
            ethCreatingRef.current = false;
          });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [privy.user, ethWallet?.wallets?.length]);

  // Log Solana wallet status changes for debugging
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log('[useAuth] Solana wallet status:', solanaWallet.status);
    if (solanaWallet.status === 'connected' && solanaWallet.wallets?.length > 0) {
      console.log('[useAuth] Solana wallet address:', solanaWallet.wallets[0].address);
    }
    if (solanaWallet.status === 'error') {
      console.warn('[useAuth] Solana wallet error (transient on cold start):', (solanaWallet as any).error);
    }
  }, [solanaWallet.status]);

  const walletAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.length > 0
      ? solanaWallet.wallets[0].address
      : null;

  // ETH wallet has no status — derive from wallets array
  const ethWalletAddress =
    (ethWallet?.wallets?.length ?? 0) > 0 ? ethWallet.wallets[0].address : null;
  const ethWalletStatus: string = ethWalletAddress
    ? 'connected'
    : ethCreatingRef.current
      ? 'creating'
      : 'not-created';

  // Update available chains when wallet statuses change
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const chains: ChainType[] = [];
    if (walletAddress) chains.push('solana');
    if (ethWalletAddress) chains.push('base');
    if (chains.length === 0) chains.push('solana'); // sensible default
    setAvailableChains(chains);
  }, [walletAddress, ethWalletAddress, setAvailableChains]);

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
   * Returns the Privy Ethereum (Base) provider for signing transactions.
   */
  const getEthWalletProvider = async () => {
    if (!ethWallet?.wallets?.length) {
      return null;
    }
    try {
      return await ethWallet.wallets[0].getProvider();
    } catch (err: any) {
      console.warn('[useAuth] getEthProvider failed:', err?.message);
      return null;
    }
  };

  /**
   * Login with an external Solana wallet via SIWS (Sign In With Solana).
   */
  const loginWithWallet = async (
    externalAddress: string,
    signMessage: (message: string) => Promise<{ signature: string }>,
    walletMeta?: { walletClientType?: string; connectorType?: string },
  ) => {
    console.log('[useAuth] Starting SIWS login for wallet:', externalAddress);

    const { message } = await siws.generateMessage({
      wallet: { address: externalAddress },
      from: {
        domain: 'momento.app',
        uri: 'https://momento.app',
      },
    });

    const { signature } = await signMessage(message);

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

  /**
   * Login with an external Ethereum/Base wallet via SIWE (Sign In With Ethereum / EIP-4361).
   *
   * Note: Privy's `useLoginWithSiwe` returns `generateSiweMessage` (resolves to a `string`,
   * NOT `{message}`) and `loginWithSiwe` (which caches the message internally and only
   * needs the signature).
   */
  const loginWithEthWallet = async (
    externalAddress: string,
    signMessage: (message: string) => Promise<{ signature: string }>,
    _walletMeta?: { walletClientType?: string; connectorType?: string },
  ) => {
    if (!siwe) {
      throw new Error('SIWE login not available');
    }
    console.log('[useAuth] Starting SIWE login for wallet:', externalAddress);

    const message: string = await siwe.generateSiweMessage({
      wallet: { address: externalAddress },
      from: {
        domain: 'momento.app',
        uri: 'https://momento.app',
      },
    });

    const { signature } = await signMessage(message);

    await siwe.loginWithSiwe({
      signature,
      // The hook caches the generated message internally; messageOverride only
      // needed if the message we sent differs from cache. We pass it for safety.
      messageOverride: message,
    });

    console.log('[useAuth] SIWE login complete');
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
      queryClient.cancelQueries();
      queryClient.clear();
      await privy.logout();
    },
    getAccessToken: async () => null, // handled by AuthBridge
    walletAddress,
    walletStatus: solanaWallet.status,
    getWalletProvider,
    // Multi-chain (Base / ETH) fields
    ethWalletAddress,
    ethWalletStatus,
    getEthWalletProvider,
    loginWithEthWallet,
    /** Generate a SIWE (EIP-4361) message for an external Ethereum wallet. */
    generateSiweMessage: siwe?.generateSiweMessage,
    /** Complete SIWE login with a pre-signed message. */
    siweLogin: siwe?.loginWithSiwe,
  };
}
