import { useEffect } from 'react';
import { getAccessToken } from '@privy-io/expo';
import { apiService } from '@/services/api';

/**
 * AuthBridge wires the Privy access token into the API service singleton.
 *
 * Must be rendered as a child of PrivyProvider so it has access to the
 * Privy context. It registers a lazy token getter on mount so every
 * subsequent API request automatically includes the Authorization header.
 *
 * This component renders its children transparently.
 */
export function AuthBridge({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log('[AuthBridge] Setting token getter');
    apiService.setTokenGetter(async () => {
      try {
        const token = await getAccessToken();
        console.log('[AuthBridge] getAccessToken returned:', token ? `token (${token.length} chars)` : 'null/undefined');
        return token;
      } catch (err) {
        console.error('[AuthBridge] getAccessToken failed:', err);
        return null;
      }
    });
  }, []);

  return <>{children}</>;
}
