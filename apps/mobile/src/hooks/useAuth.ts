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
  useCreateWallet: any;
} | false | null = null;

function getPrivyHooks() {
  if (_privyHooks === null) {
    try {
      const privy = require('@privy-io/expo');
      _privyHooks = {
        usePrivy: privy.usePrivy,
        useLoginWithOAuth: privy.useLoginWithOAuth,
        useCreateWallet: privy.useCreateWallet,
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
};

/**
 * Must only be called from components inside PrivyGuard.
 * When Privy is unavailable (Expo Go), returns guest state.
 * When Privy is available (dev build), delegates to real Privy hooks.
 */
export function useAuth() {
  const { isPrivyAvailable } = usePrivyGuard();

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
  const { createWallet } = hooks.useCreateWallet();

  return {
    isReady: privy.isReady,
    user: privy.user,
    login: async () => {
      await oauthLogin({ provider: 'google' });

      // Attempt to create an embedded Solana wallet if the user doesn't have one
      try {
        const hasWallet = privy.user?.linkedAccounts?.some(
          (account: any) => account.type === 'wallet' && account.walletClientType === 'privy',
        );
        if (!hasWallet) {
          await createWallet();
        }
      } catch (walletError: any) {
        // Don't block login if wallet creation fails (e.g. wallets not enabled in Privy dashboard)
        console.warn('[useAuth] Embedded wallet creation failed:', walletError?.message || walletError);
      }
    },
    logout: privy.logout,
    getAccessToken: async () => null, // handled by AuthBridge
  };
}
