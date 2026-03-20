import React, { createContext, useContext, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { ENV } from '@/config/env';
import { apiService } from '@/services/api';

/**
 * PrivyGuard wraps PrivyProvider + AuthBridge.
 *
 * In Expo Go, @privy-io/expo-native-extensions (ExpoCryptoAES) is not
 * available, so PrivyProvider crashes. This guard detects that and renders
 * children without auth — the app runs in "guest mode" so you can preview
 * the full UI. Auth only works in a development build.
 */

interface PrivyGuardContextType {
  isPrivyAvailable: boolean;
}

const PrivyGuardContext = createContext<PrivyGuardContextType>({ isPrivyAvailable: false });
export const usePrivyGuard = () => useContext(PrivyGuardContext);

export function PrivyGuard({ children }: { children: React.ReactNode }) {
  const isExpoGo = Constants.appOwnership === 'expo';
  const isPrivyAvailable = !isExpoGo;

  useEffect(() => {
    if (!isPrivyAvailable) {
      apiService.setTokenGetter(async () => null);
    }
  }, [isPrivyAvailable]);

  if (isExpoGo) {
    console.warn('[PrivyGuard] Running in Expo Go — Privy auth disabled (needs dev build)');
    return (
      <PrivyGuardContext.Provider value={{ isPrivyAvailable: false }}>
        {children}
      </PrivyGuardContext.Provider>
    );
  }

  // Native module available — render the real Privy stack
  return <PrivyWithAuth>{children}</PrivyWithAuth>;
}

/**
 * Separated into its own component so the `import` of @privy-io/expo
 * only executes when we know the native module exists.
 */
function PrivyWithAuth({ children }: { children: React.ReactNode }) {
  console.log('[PrivyWithAuth] Rendering...');
  const { PrivyProvider } = require('@privy-io/expo');
  const { PrivyElements } = require('@privy-io/expo/ui');
  const { AuthBridge } = require('@/providers/AuthBridge');
  console.log('[PrivyWithAuth] PrivyProvider:', typeof PrivyProvider, 'AuthBridge:', typeof AuthBridge);

  return (
    <PrivyGuardContext.Provider value={{ isPrivyAvailable: true }}>
      <PrivyProvider
        appId={ENV.PRIVY_APP_ID}
        clientId="client-WY6UDfFofojZafsbGzmGDGYExCP86xeQuKCcUvoyGmpqZ"
        config={{
          embedded: {
            solana: { createOnLogin: 'users-without-wallets' },
          },
        }}
      >
        <PrivyElements config={{
          appearance: {
            colorScheme: 'dark',
            accentColor: '#00FF88',
          },
        }} />
        <AuthBridge>
          {children}
        </AuthBridge>
      </PrivyProvider>
    </PrivyGuardContext.Provider>
  );
}
