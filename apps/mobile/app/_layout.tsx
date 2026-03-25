import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { PrivyGuard } from '@/providers/PrivyGuard';
import { LocationProvider } from '@/providers/LocationProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { ErrorBoundary } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import Toast from 'react-native-toast-message';

// Keep the native splash screen visible until we explicitly hide it.
// This prevents the white/black flash while JS bundle loads and providers init.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Hide splash screen once the root layout has mounted (providers + nav ready)
  const onLayoutReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <QueryProvider>
          <PrivyGuard>
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
