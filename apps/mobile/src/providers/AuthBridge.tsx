import { useEffect } from 'react';
import { usePrivy } from '@privy-io/expo';
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
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    apiService.setTokenGetter(async () => {
      try {
        const token = await getAccessToken();
        return token;
      } catch {
        return null;
      }
    });
  }, [getAccessToken]);

  return <>{children}</>;
}
