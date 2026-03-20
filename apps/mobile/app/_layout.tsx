import React from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { PrivyGuard } from '@/providers/PrivyGuard';
import { LocationProvider } from '@/providers/LocationProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { ErrorBoundary } from '@/components/primitives';
import { COLORS } from '@/styles/theme';
import Toast from 'react-native-toast-message';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
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
                  <Stack.Screen name="login" options={{ animation: 'fade' }} />
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
