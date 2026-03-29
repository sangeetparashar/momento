import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';

/**
 * Catch-all for unmatched routes.
 *
 * Primarily handles Phantom wallet deeplink callbacks that expo-router
 * can't match (e.g. momento://momento///?wallet_action=onConnect&...).
 *
 * For wallet callbacks: go BACK to the previous screen (login) so the
 * Phantom connector hooks stay mounted and can process the response.
 *
 * For non-wallet routes: redirect to index.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const isWalletCallback =
    pathname?.includes('wallet_action') ||
    Object.keys(params).some(
      (k) =>
        k === 'wallet_action' ||
        k === 'phantom_encryption_public_key' ||
        k === 'data' ||
        k === 'nonce',
    );

  useEffect(() => {
    console.log('[+not-found] Unmatched route:', pathname, 'wallet callback:', isWalletCallback);

    if (isWalletCallback) {
      // Give the Phantom connector time to process the encrypted response
      // via its Linking event listener, then go back to login screen.
      const timer = setTimeout(() => {
        try {
          if (router.canGoBack()) {
            router.back();
          } else {
            setShouldRedirect(true);
          }
        } catch {
          setShouldRedirect(true);
        }
      }, 800);
      return () => clearTimeout(timer);
    }

    // Non-wallet route — redirect to home after brief delay
    const timer = setTimeout(() => setShouldRedirect(true), 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (shouldRedirect) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <MomentoLogo size={48} showText />
      {isWalletCallback && (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: SPACING.xl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
