import React, { useCallback, useEffect } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider, QueryCacheCleaner } from '@/providers/QueryProvider';
import { PrivyGuard } from '@/providers/PrivyGuard';
import { LocationProvider } from '@/providers/LocationProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import Toast from 'react-native-toast-message';

// Keep the native splash screen visible until we explicitly hide it.
// This prevents the white/black flash while JS bundle loads and providers init.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Wires the current auth user into QueryCacheCleaner */
function AuthAwareQueryCacheCleaner() {
  const { user } = useAuth();
  return <QueryCacheCleaner userId={user?.id ?? null} />;
}

/**
 * Intercepts Phantom/wallet deeplink callback URLs that would otherwise
 * cause expo-router's "Unmatched Route" error. When Phantom redirects
 * back (momento://momento///?wallet_action=onConnect&...), expo-router
 * can't match it as a file-based route. We detect these and redirect
 * to the index screen instead.
 */
function useWalletDeeplinkInterceptor() {
  const router = useRouter();

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.includes('wallet_action=') || url.includes('phantom_encryption')) {
        console.log('[DeeplinkInterceptor] Caught wallet callback URL — letting Privy connector process first');
        // Give the Privy connector plenty of time to process the encrypted data
        // before we redirect. The +not-found screen also has its own delay.
        setTimeout(() => {
          try { router.replace('/'); } catch { /* nav not ready */ }
        }, 2000);
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);

    // Also check the initial URL on mount (cold start from deeplink)
    Linking.getInitialURL().then((url) => {
      if (url && (url.includes('wallet_action=') || url.includes('phantom_encryption'))) {
        console.log('[DeeplinkInterceptor] Initial URL is wallet callback, letting Privy process');
        setTimeout(() => {
          try { router.replace('/'); } catch { /* nav not ready */ }
        }, 2500);
      }
    });

    return () => sub.remove();
  }, [router]);
}

export default function RootLayout() {
  // Hide splash screen once the root layout has mounted (providers + nav ready)
  const onLayoutReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useWalletDeeplinkInterceptor();

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <QueryProvider>
          <PrivyGuard>
            <AuthAwareQueryCacheCleaner />
            <LocationProvider>
              <NotificationProvider>
                <StatusBar style="light" />
                <ErrorBoundary>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: COLORS.background },
                    animation: 'slide_from_right',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
                  <Stack.Screen name="fund-wallet-onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="creator/[id]"
                    options={{ animation: 'slide_from_right' }}
                  />
                  <Stack.Screen
                    name="user/[id]"
                    options={{ animation: 'slide_from_right' }}
                  />
                  <Stack.Screen
                    name="post/[id]"
                    options={{ animation: 'slide_from_bottom' }}
                  />
                  <Stack.Screen
                    name="market"
                    options={{ animation: 'slide_from_right' }}
                  />
                  <Stack.Screen
                    name="edit-profile"
                    options={{
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="setup-profile"
                    options={{
                      animation: 'fade',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="create-post"
                    options={{
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="delete-account"
                    options={{
                      headerShown: false,
                      presentation: 'modal',
                    }}
                  />
                  <Stack.Screen
                    name="wallet"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  />
                  <Stack.Screen
                    name="notifications"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                    }}
                  />
                  <Stack.Screen
                    name="settings"
                    options={{ headerShown: false }}
                  />
                </Stack>
                </ErrorBoundary>
              </NotificationProvider>
            </LocationProvider>
          </PrivyGuard>
        </QueryProvider>
      </SafeAreaProvider>
      <Toast />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
