> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Agent 9: Mobile Wallet UI + Chain Switcher

## Mission
Update the wallet screen to support chain switching with a dropdown selector and display chain-appropriate balances, assets, explorer links, and labels.

## Prerequisites
- Agent 1 (shared types with ChainType, CHAIN_CONFIG) must be merged
- Agent 3 (env config with BASE_* vars) must be merged
- Agent 8 (ChainProvider + useChain hook + useAuth ETH wallet) must be merged

## Files to Read First
- `apps/mobile/app/wallet.tsx` — current wallet screen (FULL READ REQUIRED — 703 lines)
- `apps/mobile/src/hooks/useWalletBalance.ts` — balance polling hook
- `apps/mobile/src/hooks/useAuth.ts` — wallet addresses (after Agent 8)
- `apps/mobile/src/providers/ChainProvider.tsx` — chain context (after Agent 8)
- `apps/mobile/src/config/env.ts` — env config (after Agent 3)
- `apps/mobile/src/utils/formatters.ts` — address formatting
- `packages/shared/src/constants.ts` — CHAIN_CONFIG (after Agent 1)

## Files to Modify
- `apps/mobile/app/wallet.tsx` — main wallet screen
- `apps/mobile/src/hooks/useWalletBalance.ts` — chain-aware balance fetching

## Files to Create
- `apps/mobile/src/components/features/ChainSwitcher.tsx` — NEW: dropdown component

---

## Detailed Instructions

### Step 1: Update useWalletBalance Hook

In `apps/mobile/src/hooks/useWalletBalance.ts`, make the balance query chain-aware:

**Current:**
```typescript
const query = useQuery<WalletBalance>({
  queryKey: ['walletBalance'],
  queryFn: () => apiService.get<WalletBalance>('/wallet/balance'),
  refetchInterval: pollInterval,
  // ...
});
```

**Updated:**
```typescript
import { useChain } from '@/hooks/useChain';

export function useWalletBalance() {
  const { chain } = useChain();

  // ... existing state (pollInterval, fastPolling, etc.) ...

  const query = useQuery<WalletBalance>({
    queryKey: ['walletBalance', chain],      // chain in cache key!
    queryFn: () => apiService.get<WalletBalance>(`/wallet/balance?chain=${chain}`),
    refetchInterval: pollInterval,
    // ... existing options ...
  });

  // ... rest of hook unchanged ...
}
```

**CRITICAL**: The `queryKey` MUST include `chain` so switching chains triggers a fresh fetch and caches separately.

### Step 2: Create ChainSwitcher Component

Create `apps/mobile/src/components/features/ChainSwitcher.tsx`:

```typescript
import React, { useState, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/primitives';
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import type { ChainType } from '@momento/shared';

export function ChainSwitcher() {
  const { chain, setChain, availableChains } = useChain();
  const [showDropdown, setShowDropdown] = useState(false);

  // Don't show switcher if only one chain available
  if (availableChains.length <= 1) {
    return (
      <View style={styles.singleChain}>
        <View style={[styles.chainDot, { backgroundColor: CHAIN_CONFIG[chain].iconColor }]} />
        <Text style={styles.chainName}>{CHAIN_CONFIG[chain].name}</Text>
      </View>
    );
  }

  const handleSelect = (selected: ChainType) => {
    setChain(selected);
    setShowDropdown(false);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setShowDropdown(true)} style={styles.selector}>
        <View style={[styles.chainDot, { backgroundColor: CHAIN_CONFIG[chain].iconColor }]} />
        <Text style={styles.chainName}>{CHAIN_CONFIG[chain].name}</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
      </Pressable>

      <Modal
        visible={showDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdown(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowDropdown(false)}>
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>SELECT NETWORK</Text>
            {availableChains.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.dropdownItem,
                  c === chain && styles.dropdownItemActive,
                ]}
                onPress={() => handleSelect(c)}
              >
                <View style={[styles.chainDot, { backgroundColor: CHAIN_CONFIG[c].iconColor }]} />
                <View style={styles.dropdownItemText}>
                  <Text style={styles.dropdownItemName}>{CHAIN_CONFIG[c].name}</Text>
                  <Text style={styles.dropdownItemSymbol}>
                    {CHAIN_CONFIG[c].symbol} network
                  </Text>
                </View>
                {c === chain && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  singleChain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chainDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chainName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownTitle: {
    ...TYPOGRAPHY.label,
    color: COLORS.textTertiary,
    letterSpacing: 1,
    marginBottom: SPACING.md,
    fontSize: 11,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.xs,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primary + '15',
  },
  dropdownItemText: {
    flex: 1,
  },
  dropdownItemName: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  dropdownItemSymbol: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textTertiary,
    fontSize: 12,
  },
});
```

### Step 3: Update Wallet Screen

In `apps/mobile/app/wallet.tsx`, make the following changes:

**3a. Import new dependencies:**
```typescript
import { ChainSwitcher } from '@/components/features/ChainSwitcher';
import { useChain } from '@/hooks/useChain';
import { CHAIN_CONFIG } from '@momento/shared';
```

**3b. Get chain context:**
```typescript
export default function WalletScreen() {
  const { chain } = useChain();
  const chainConfig = CHAIN_CONFIG[chain];
  // ... existing hooks ...
```

**3c. Update explorer URL helper (currently `getSolscanUrl`):**

Replace the existing `getSolscanUrl` function:
```typescript
function getExplorerUrl(chain: ChainType, addressOrTx: string, type: 'address' | 'tx' = 'address'): string {
  if (chain === 'base') {
    return `https://basescan.org/${type}/${addressOrTx}`;
  }
  // Solana
  const cluster = ENV.SOLANA_NETWORK === 'devnet' ? '?cluster=devnet' : '';
  const solType = type === 'address' ? 'account' : 'tx';
  return `https://solscan.io/${solType}/${addressOrTx}${cluster}`;
}
```

**3d. Update wallet address resolution:**

The current code uses `clientWalletAddress` from useAuth(). Update to be chain-aware:

```typescript
const { walletAddress: solWalletAddress, ethWalletAddress } = useAuth();

// Select wallet address based on current chain
const walletAddress = chain === 'base'
  ? ethWalletAddress
  : (solWalletAddress ||
     (profile?.walletAddress && !profile.walletAddress.startsWith('pending-')
       ? profile.walletAddress
       : null));
```

**3e. Replace the wallet address card:**

Replace the "Solana Wallet" label and Solscan references:

```typescript
{/* Wallet Address Card */}
{walletAddress ? (
  <View style={styles.addressCard}>
    {/* Chain Switcher at top */}
    <View style={styles.addressRow}>
      <ChainSwitcher />
      <View style={styles.networkBadge}>
        <Text style={styles.networkText}>
          {chain === 'base'
            ? (ENV.BASE_NETWORK === 'testnet' ? 'TESTNET' : 'MAINNET')
            : (ENV.SOLANA_NETWORK === 'devnet' ? 'DEVNET' : 'MAINNET')}
        </Text>
      </View>
    </View>
    <View style={styles.addressActions}>
      <Pressable onPress={handleCopyAddress} style={styles.addressTouchable}>
        <Text style={styles.addressText}>
          {truncateAddress(walletAddress, 8, 6)}
        </Text>
        <Ionicons
          name={copied ? 'checkmark-circle' : 'copy-outline'}
          size={16}
          color={copied ? COLORS.success : COLORS.textTertiary}
        />
      </Pressable>
      <Pressable onPress={handleOpenExplorer} style={styles.solscanButton}>
        <Text style={styles.solscanText}>View on {chainConfig.explorerName}</Text>
        <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
      </Pressable>
    </View>
  </View>
) : (
  <View style={styles.addressCard}>
    <View style={styles.addressRow}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <Text style={styles.addressLabel}>Creating wallet...</Text>
    </View>
  </View>
)}
```

**3f. Replace the native token (SOL) asset card:**

Make the native token card dynamic:

```typescript
{/* Native Token Card (SOL or ETH) */}
<View style={styles.assetCard}>
  <View style={styles.assetLeft}>
    <View style={[styles.assetIcon, { backgroundColor: chainConfig.iconColor }]}>
      <Text style={styles.assetIconText}>{chainConfig.nativeIcon}</Text>
    </View>
    <View>
      <Text style={styles.assetSymbol}>{chainConfig.symbol}</Text>
      <Text style={styles.assetName}>{chainConfig.name}</Text>
    </View>
  </View>
  <View style={styles.assetRight}>
    <Text style={styles.assetAmount}>
      {(balance.nativeBalance ?? balance.solBalance).toFixed(4)}
    </Text>
    <Text style={styles.assetValue}>
      {formatCurrency(
        (balance.nativeBalance ?? balance.solBalance) *
        (balance.nativePriceUsd ?? balance.solPriceUsd ?? 0)
      )}
    </Text>
  </View>
</View>
```

**3g. Update explorer link handlers:**

```typescript
const handleOpenExplorer = useCallback(() => {
  if (!walletAddress) return;
  Linking.openURL(getExplorerUrl(chain, walletAddress, 'address'));
}, [walletAddress, chain]);
```

**3h. Update recent transactions explorer links:**

```typescript
onPress={() => Linking.openURL(getExplorerUrl(chain, tx.signature, 'tx'))}
```

### Step 4: Export ChainSwitcher from features index

If there's a barrel export file at `apps/mobile/src/components/features/index.ts`, add:

```typescript
export { ChainSwitcher } from './ChainSwitcher';
```

---

## Verification Checklist

1. **ChainSwitcher renders**: Shows current chain with dropdown arrow
2. **Dropdown shows available chains**: Only chains user has wallets for
3. **Single chain hides dropdown**: Just shows chain name (no arrow)
4. **Chain selection persisted**: Switching chains survives app restart
5. **Balance refetches on chain switch**: queryKey includes chain
6. **Native token displays correctly**: SOL icon/label for Solana, ETH for Base
7. **Explorer links correct**: Solscan for Solana, BaseScan for Base
8. **Network badge correct**: DEVNET/MAINNET for Solana, TESTNET/MAINNET for Base
9. **Wallet address resolves per chain**: Solana address for Solana, ETH address for Base
10. **TypeScript compiles**: `cd apps/mobile && npx tsc --noEmit`

## What to Commit
```
feat(mobile): add chain switcher dropdown and chain-aware wallet screen

- Create ChainSwitcher component with modal dropdown
- Update wallet screen to display chain-specific balances and labels
- Dynamic native token display (SOL/ETH) based on selected chain
- Chain-specific explorer links (Solscan/BaseScan)
- Balance hook fetches per-chain data with chain in query key
- Chain selection persisted to AsyncStorage
```
