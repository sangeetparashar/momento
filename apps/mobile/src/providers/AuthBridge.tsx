import { useEffect } from 'react';
import { getAccessToken } from '@privy-io/expo';
import { apiService } from '@/services/api';
import { ENV } from '@/config/env';

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
        if (__DEV__) {
          console.log(
            '[AuthBridge] getAccessToken →',
            token ? `${token.slice(0, 20)}... (len=${token.length})` : 'NULL',
          );
        }
        return token;
      } catch (err) {
        console.warn('[AuthBridge] getAccessToken failed:', err);
        return null;
      }
    });

    // One-shot diagnostic: ping /api/debug/auth so we can see exactly what
    // the server thinks of the token. Output goes straight to logcat.
    if (__DEV__) {
      (async () => {
        // Wait a beat so Privy has a chance to hydrate its session
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const token = await getAccessToken();
          console.log(
            '[AuthBridge:diag] token before /debug/auth →',
            token ? `${token.slice(0, 20)}...` : 'NULL',
          );
          const res = await fetch(`${ENV.API_URL}/debug/auth`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const body = await res.text();
          console.log('[AuthBridge:diag] /debug/auth status =', res.status);
          console.log('[AuthBridge:diag] /debug/auth body =', body);
        } catch (err) {
          console.log(
            '[AuthBridge:diag] /debug/auth fetch failed:',
            (err as Error)?.message || err,
          );
        }
      })();
    }
  }, []);

  return <>{children}</>;
}
