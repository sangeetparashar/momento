import { useEffect, useRef } from 'react';
import { usePrivyGuard } from '@/providers/PrivyGuard';

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
  useFundSolanaWallet: any;
} | false | null = null;

function getPrivyHooks() {
  if (_privyHooks === null) {
    try {
      const privy = require('@privy-io/expo');
      const privyUI = require('@privy-io/expo/ui');
      _privyHooks = {
        usePrivy: privy.usePrivy,
        useLoginWithOAuth: privy.useLoginWithOAuth,
        useEmbeddedSolanaWallet: privy.useEmbeddedSolanaWallet,
        useFundSolanaWallet: privyUI.useFundSolanaWallet,
      };
    } catch {
      _privyHooks = false;
    }
  }
  return _privyHooks;
}

const GUEST_AUTH = {
  isReady: true,
  user: null,
  login: async () => {
    console.warn('[useAuth] Privy not available in Expo Go — use a development build.');
  },
  logout: async () => {},
  getAccessToken: async () => null,
  walletAddress: null as string | null,
  walletStatus: 'disconnected' as string,
  fundWallet: async () => {},
  canFund: false,
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
  const solanaWallet = hooks.useEmbeddedSolanaWallet({
    onCreateWalletSuccess: (wallet: any) => {
      console.log('[useAuth] Solana wallet created successfully:', wallet?.address);
      creatingRef.current = false;
    },
    onCreateWalletError: (error: Error) => {
      console.error('[useAuth] Solana wallet creation failed:', error.message);
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
            console.error('[useAuth] Wallet create() rejected:', err?.message || err);
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
      console.error('[useAuth] Wallet error:', (solanaWallet as any).error);
    }
  }, [solanaWallet.status]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const fundHook = hooks.useFundSolanaWallet ? hooks.useFundSolanaWallet() : null;

  const walletAddress =
    solanaWallet.status === 'connected' && solanaWallet.wallets?.length > 0
      ? solanaWallet.wallets[0].address
      : null;

  const fundWallet = async (asset: 'native-currency' | 'USDC' = 'native-currency') => {
    if (!fundHook?.fundWallet || !walletAddress) {
      console.warn('[useAuth] Funding not available');
      return;
    }
    await fundHook.fundWallet({
      address: walletAddress,
      asset,
      cluster: { name: 'mainnet-beta' },
      defaultPaymentMethod: 'card' as any,
    });
  };

  return {
    isReady: privy.isReady,
    user: privy.user,
    login: async () => {
      await oauthLogin({ provider: 'google' });
      // Wallet creation happens via the useEffect above once the user state updates
    },
    logout: privy.logout,
    getAccessToken: async () => null, // handled by AuthBridge
    walletAddress,
    walletStatus: solanaWallet.status,
    fundWallet,
    canFund: !!fundHook?.fundWallet,
  };
}
