import { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';
import { Text, MomentoLogo } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

/**
 * Catch-all for unmatched routes.
 *
 * Primarily handles Phantom wallet deeplink callbacks that expo-router
 * can't match (e.g. momento://momento///?wallet_action=onConnect&...).
 * Redirects back to the index screen immediately.
 */
export default function NotFoundScreen() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  useEffect(() => {
    console.log('[+not-found] Unmatched route:', pathname, 'params:', JSON.stringify(params));
  }, [pathname, params]);

  // Immediately redirect — the Privy connector processes the URL data
  // via Linking event listeners independently of the router
  return <Redirect href="/" />;
}

