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
let _usePrivy: any = null;

function getUsePrivy() {
  if (_usePrivy === null) {
    try {
      _usePrivy = require('@privy-io/expo').usePrivy;
    } catch {
      _usePrivy = false;
    }
  }
  return _usePrivy;
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
 * When Privy is available (dev build), delegates to real usePrivy().
 */
export function useAuth() {
  const { isPrivyAvailable } = usePrivyGuard();

  if (!isPrivyAvailable) {
    return GUEST_AUTH;
  }

  // This branch only runs when PrivyProvider is in the tree,
  // so calling usePrivy() is safe (it has a provider above it).
  const usePrivy = getUsePrivy();
  if (!usePrivy) return GUEST_AUTH;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return usePrivy();
}
