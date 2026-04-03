# Agent 8: Mobile Auth + Chain Context

## Mission
This is the most critical mobile agent. It does three things:
1. Update `useAuth` hook to create BOTH Solana and Ethereum embedded wallets for OAuth users
2. Add SIWE (Sign In With Ethereum) support for external Base wallet login
3. Create the `ChainContext` provider that the entire wallet UI depends on

## Prerequisites
- Agent 1 (shared types with ChainType) must be merged
- Agent 3 (env config with BASE_* vars) must be merged

## Files to Read First
- `apps/mobile/src/hooks/useAuth.ts` — current auth hook (FULL READ REQUIRED)
- `apps/mobile/src/providers/PrivyGuard.tsx` — Privy provider setup
- `apps/mobile/src/providers/AuthBridge.tsx` — token injection
- `apps/mobile/app/login.tsx` — login screen with Phantom + MWA
- `apps/mobile/app/_layout.tsx` — root layout (to understand provider tree)
- `apps/mobile/src/config/env.ts` — env config (after Agent 3)

## Files to Create
- `apps/mobile/src/providers/ChainProvider.tsx` — NEW: chain context provider
- `apps/mobile/src/hooks/useChain.ts` — NEW: chain selection hook

## Files to Modify
- `apps/mobile/src/hooks/useAuth.ts` — add ETH wallet support
- `apps/mobile/src/providers/PrivyGuard.tsx` — enable ETH embedded wallet
- `apps/mobile/app/login.tsx` — add WalletConnect / Base wallet login
- `apps/mobile/app/_layout.tsx` — add ChainProvider to provider tree

---

## Detailed Instructions

### Step 1: Create ChainProvider

Create `apps/mobile/src/providers/ChainProvider.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChainType } from '@momento/shared';

interface ChainContextValue {
  /** Currently selected chain */
  chain: ChainType;
  /** Switch to a different chain */
  setChain: (chain: ChainType) => void;
  /** Chains available to this user (both for OAuth, single for external wallet) */
  availableChains: ChainType[];
  /** Set available chains (called by useAuth when wallet status is known) */
  setAvailableChains: (chains: ChainType[]) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: 'solana',
  setChain: () => {},
  availableChains: ['solana'],
  setAvailableChains: () => {},
});

const CHAIN_STORAGE_KEY = 'momento_selected_chain';

export function ChainProvider({ children }: { children: React.ReactNode }) {
  const [chain, setChainState] = useState<ChainType>('solana');
  const [availableChains, setAvailableChains] = useState<ChainType[]>(['solana']);

  // Load persisted chain preference on mount
  useEffect(() => {
    AsyncStorage.getItem(CHAIN_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'solana' || stored === 'base') {
          setChainState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setChain = useCallback((newChain: ChainType) => {
    setChainState(newChain);
    AsyncStorage.setItem(CHAIN_STORAGE_KEY, newChain).catch(() => {});
  }, []);

  // If selected chain is not available, switch to first available
  useEffect(() => {
    if (!availableChains.includes(chain) && availableChains.length > 0) {
      setChain(availableChains[0]);
    }
  }, [availableChains, chain, setChain]);

  return (
    <ChainContext.Provider value={{ chain, setChain, availableChains, setAvailableChains }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  return useContext(ChainContext);
}
```

### Step 2: Create useChain hook re-export

Create `apps/mobile/src/hooks/useChain.ts`:

```typescript
// Re-export for convenient access from hooks directory
export { useChain } from '@/providers/ChainProvider';
```

### Step 3: Add ChainProvider to app layout

In `apps/mobile/app/_layout.tsx`, find the provider tree and add `ChainProvider`:

```typescript
import { ChainProvider } from '@/providers/ChainProvider';

// In the render tree, wrap inside the existing providers:
// <QueryProvider>
//   <PrivyGuard>
//     <ChainProvider>        {/* NEW */}
//       {children}
//     </ChainProvider>
//   </PrivyGuard>
// </QueryProvider>
```

Place `ChainProvider` INSIDE `PrivyGuard` but around the children/slot. It should NOT be inside AuthBridge since it doesn't depend on auth token.

### Step 4: Enable Ethereum Embedded Wallet in PrivyGuard

In `apps/mobile/src/providers/PrivyGuard.tsx`, find the PrivyProvider config (around lines 49-72). The current config enables only Solana:

```typescript
// Current:
config={{
  embeddedWallets: {
    solana: {
      createOnLogin: 'users-without-wallets',
    },
  },
}}
```

Update to enable BOTH Solana and Ethereum:

```typescript
config={{
  embeddedWallets: {
    solana: {
      createOnLogin: 'users-without-wallets',
    },
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
}}
```

**RESEARCH REQUIRED**: Verify the exact Privy Expo SDK config shape for enabling Ethereum embedded wallets. Check:
1. `node_modules/@privy-io/expo` type definitions
2. Privy docs: https://docs.privy.io/guide/expo/embedded/ethereum
3. The config key might be `ethereum` or `evm` — verify.

### Step 5: Update useAuth Hook

This is the most complex change. In `apps/mobile/src/hooks/useAuth.ts`:

**5a. Add Ethereum wallet hook import:**

Update the `getPrivyHooks()` function to also load `useEmbeddedEthereumWallet`:

```typescript
function getPrivyHooks() {
  if (_privyHooks === null) {
    try {
      const privy = require('@privy-io/expo');
      _privyHooks = {
        usePrivy: privy.usePrivy,
        useLoginWithOAuth: privy.useLoginWithOAuth,
        useEmbeddedSolanaWallet: privy.useEmbeddedSolanaWallet,
        useEmbeddedEthereumWallet: privy.useEmbeddedEthereumWallet,  // NEW
        useLoginWithSiws: privy.useLoginWithSiws,
        useLoginWithSiwe: privy.useLoginWithSiwe,                    // NEW
      };
    } catch {
      _privyHooks = false;
    }
  }
  return _privyHooks;
}
```

**RESEARCH REQUIRED**: Verify that `@privy-io/expo` exports `useEmbeddedEthereumWallet` and `useLoginWithSiwe`. Check the Privy Expo SDK docs. If the hook name is different (e.g., `useEmbeddedEvmWallet`), adjust accordingly.

**5b. Add Ethereum wallet state in useAuth():**

Inside the `useAuth()` function body, after the existing Solana wallet setup:

```typescript
// Existing Solana wallet (keep as-is)
const solanaWallet = hooks.useEmbeddedSolanaWallet({
  onCreateWalletSuccess: (wallet: any) => { ... },
  onCreateWalletError: (error: Error) => { ... },
});

// NEW: Ethereum wallet for Base chain
const ethWallet = hooks.useEmbeddedEthereumWallet({
  onCreateWalletSuccess: (wallet: any) => {
    console.log('[useAuth] ETH wallet created successfully:', wallet?.address);
  },
  onCreateWalletError: (error: Error) => {
    console.warn('[useAuth] ETH wallet creation failed:', error.message);
  },
});
```

**5c. Auto-create ETH wallet (similar to Solana auto-create):**

Add a useEffect similar to the existing Solana wallet auto-create (lines 110-133):

```typescript
const ethCreatingRef = useRef(false);

useEffect(() => {
  if (
    privy.user &&
    ethWallet.status === 'not-created' &&
    !ethCreatingRef.current
  ) {
    const timer = setTimeout(() => {
      if (ethCreatingRef.current) return;
      console.log('[useAuth] User logged in but no ETH wallet — creating...');
      ethCreatingRef.current = true;
      ethWallet.create({ recoveryMethod: 'privy' }).catch((err: any) => {
        if (err?.message?.includes('already exists')) {
          console.log('[useAuth] ETH wallet already exists — skipping creation');
        } else {
          console.warn('[useAuth] ETH wallet create() rejected:', err?.message || err);
        }
        ethCreatingRef.current = false;
      });
    }, 2000); // Slight delay after Solana wallet creation
    return () => clearTimeout(timer);
  }
}, [privy.user, ethWallet.status]);
```

**5d. Extract ETH wallet address:**

```typescript
const ethWalletAddress =
  ethWallet.status === 'connected' && ethWallet.wallets?.length > 0
    ? ethWallet.wallets[0].address
    : null;
```

**5e. Add getEthWalletProvider:**

```typescript
const getEthWalletProvider = async () => {
  if (ethWallet.status !== 'connected' || !ethWallet.wallets?.length) {
    return null;
  }
  try {
    return await ethWallet.wallets[0].getProvider();
  } catch (err: any) {
    console.warn('[useAuth] getEthProvider failed:', err?.message);
    return null;
  }
};
```

**5f. Update available chains based on wallet status:**

Import useChain and update available chains when wallet statuses change:

```typescript
import { useChain } from '@/providers/ChainProvider';

// Inside useAuth(), after wallet state extraction:
const { setAvailableChains } = useChain();

useEffect(() => {
  const chains: ChainType[] = [];
  if (walletAddress) chains.push('solana');
  if (ethWalletAddress) chains.push('base');
  if (chains.length === 0) chains.push('solana'); // fallback
  setAvailableChains(chains);
}, [walletAddress, ethWalletAddress, setAvailableChains]);
```

**5g. Update return value:**

The return object of useAuth() should now include:

```typescript
return {
  // ... all existing fields ...
  walletAddress,               // Solana (existing)
  walletStatus: solanaWallet.status,
  getWalletProvider,           // Solana provider (existing)

  // NEW: Base/ETH wallet
  ethWalletAddress,
  ethWalletStatus: ethWallet.status,
  getEthWalletProvider,

  // NEW: SIWE support
  loginWithEthWallet,          // see Step 6
  generateSiweMessage: siwe?.generateMessage,
  siweLogin: siwe?.login,
};
```

### Step 6: Add SIWE Login Method

Add the SIWE equivalent of `loginWithWallet` for external Base/ETH wallet login:

```typescript
// Initialize SIWE hook
const siwe = hooks.useLoginWithSiwe ? hooks.useLoginWithSiwe() : null;

const loginWithEthWallet = async (
  externalAddress: string,
  signMessage: (message: string) => Promise<{ signature: string }>,
  walletMeta?: { walletClientType?: string; connectorType?: string },
) => {
  if (!siwe) {
    throw new Error('SIWE login not available');
  }

  console.log('[useAuth] Starting SIWE login for wallet:', externalAddress);

  const { message } = await siwe.generateMessage({
    wallet: { address: externalAddress },
    from: {
      domain: 'momento.app',
      uri: 'https://momento.app',
    },
  });

  const { signature } = await signMessage(message);

  await siwe.login({
    signature,
    message,
    wallet: {
      walletClientType: walletMeta?.walletClientType ?? 'unknown',
      connectorType: walletMeta?.connectorType ?? 'wallet_connect',
    },
  });

  console.log('[useAuth] SIWE login complete');
};
```

**RESEARCH REQUIRED**: Verify that `@privy-io/expo` exports `useLoginWithSiwe`. The SIWE flow may work differently than SIWS:
- Check if Privy's SIWE uses EIP-4361 message format
- Check the `generateMessage` and `login` signatures for SIWE
- If Privy doesn't have a dedicated SIWE hook, check if `useLoginWithSiws` can handle ETH wallets too (unlikely but check)

### Step 7: Update Login Screen for Base Wallet Login

In `apps/mobile/app/login.tsx`, add a new login option for WalletConnect / external ETH wallets.

**RESEARCH REQUIRED**: For WalletConnect integration with Privy on React Native:
1. Check if Privy Expo SDK has a built-in WalletConnect connector
2. Check if `@privy-io/expo/connectors` exports a WalletConnect connector
3. If not, check if we need `@walletconnect/react-native-compat` + `@privy-io/expo` integration

For MVP, add a simple "Connect Base Wallet" button that uses Privy's built-in wallet connection:

```typescript
// In login.tsx, add a new section after the Phantom/MWA buttons:

function BaseWalletLogin() {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Use Privy's built-in wallet connection for EVM
      // This will show WalletConnect modal or Coinbase Wallet connection
      // RESEARCH: Verify the exact API for this
      await auth.loginWithEthWallet(
        /* address from WalletConnect */,
        /* signMessage callback */,
        { walletClientType: 'wallet_connect', connectorType: 'wallet_connect' }
      );
    } catch (error) {
      console.error('Base wallet login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable onPress={handleConnect} style={styles.walletButton}>
      <Text>CONNECT BASE WALLET</Text>
    </Pressable>
  );
}
```

**NOTE**: The exact WalletConnect implementation depends heavily on what Privy's Expo SDK supports. The agent MUST research this. If Privy doesn't support WalletConnect on React Native, the agent should:
1. Document the limitation
2. Add a placeholder button that shows "Coming Soon"
3. Still implement the SIWE backend flow so it's ready when WalletConnect is available

### Step 8: Update GUEST_AUTH

Update the `GUEST_AUTH` constant to include the new fields:

```typescript
const GUEST_AUTH = {
  // ... existing fields ...
  ethWalletAddress: null as string | null,
  ethWalletStatus: 'disconnected' as string,
  getEthWalletProvider: async () => null as any,
  loginWithEthWallet: async () => {
    console.warn('[useAuth] Privy not available in Expo Go');
  },
  generateSiweMessage: async () => ({ message: '' }),
  siweLogin: async () => {},
};
```

---

## Verification Checklist

1. **ChainProvider exists**: `apps/mobile/src/providers/ChainProvider.tsx` created
2. **ChainProvider in layout**: Added to `_layout.tsx` provider tree
3. **useChain hook works**: Returns `{ chain, setChain, availableChains }`
4. **PrivyGuard enables ETH wallet**: `ethereum: { createOnLogin: 'users-without-wallets' }`
5. **useAuth creates ETH wallet**: Auto-creates on OAuth login with slight delay
6. **useAuth returns ETH wallet info**: `ethWalletAddress`, `ethWalletStatus`, `getEthWalletProvider`
7. **Available chains updated**: Based on which wallets exist
8. **SIWE login method exists**: `loginWithEthWallet` function in useAuth return
9. **GUEST_AUTH includes new fields**: No crashes in Expo Go mode
10. **TypeScript compiles**: `cd apps/mobile && npx tsc --noEmit` — zero errors
11. **Login screen has Base wallet option**: Even if placeholder/coming-soon

## What to Commit
```
feat(mobile): add multi-chain auth with ETH wallet and chain context

- Create ChainProvider for chain selection persistence
- Enable Ethereum embedded wallet creation in Privy config
- Auto-create both Solana and ETH wallets for OAuth users
- Add SIWE login support for external Base wallets
- Add useChain hook for chain switching across the app
- Update GUEST_AUTH with new wallet fields
```
