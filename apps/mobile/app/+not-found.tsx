import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';

/**
 * Catch-all for unmatched routes.
 *
 * Primarily handles Phantom wallet deeplink callbacks that expo-router
 * can't match (e.g. momento://momento///?wallet_action=onConnect&...).
 *
 * We delay the redirect briefly to give the Privy Phantom connector time
 * to process the encrypted callback data from the URL before we navigate away.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const isWalletCallback =
    pathname?.includes('wallet_action') ||
    Object.keys(params).some(
      (k) => k === 'wallet_action' || k === 'phantom_encryption_public_key' || k === 'data' || k === 'nonce'
    );

  useEffect(() => {
    console.log('[+not-found] Unmatched route:', pathname, 'params:', JSON.stringify(params));
    console.log('[+not-found] Is wallet callback:', isWalletCallback);

    // If this is a Phantom callback, wait longer to let the Privy connector
    // process the encrypted response via the Linking event listener
    const delay = isWalletCallback ? 1500 : 100;

    const timer = setTimeout(() => {
      setShouldRedirect(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [pathname]);

  if (shouldRedirect) {
    return <Redirect href="/" />;
  }

  // Show a brief loading screen while we wait
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
