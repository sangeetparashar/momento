# Agent 1: Shared Types & Constants

## Mission
Update the `@momento/shared` package to add multi-chain type definitions and Base chain constants. This is the foundational type layer that ALL other agents depend on.

## Files to Read First
- `packages/shared/src/types.ts` — current type definitions
- `packages/shared/src/constants.ts` — current constants
- `packages/shared/src/index.ts` — exports

## Files to Modify
- `packages/shared/src/types.ts`
- `packages/shared/src/constants.ts`

## Files to Create
- (none — modify existing files only)

---

## Detailed Instructions

### Step 1: Add ChainType to types.ts

At the top of `packages/shared/src/types.ts`, after the existing enums, add:

```typescript
// Chain types
export type ChainType = 'solana' | 'base';
```

### Step 2: Update WalletBalance interface

The current `WalletBalance` interface is:
```typescript
export interface WalletBalance {
  solBalance: number;
  solPriceUsd?: number;
  tokens: TokenHolding[];
  totalValueUsd?: number;
  change24h?: number;
  earningsToDate?: number;
}
```

**Replace** it with a chain-aware version. KEEP the old fields for backward compatibility but add new ones:

```typescript
export interface WalletBalance {
  // Chain identifier
  chain: ChainType;

  // Native token balance (SOL for Solana, ETH for Base)
  nativeBalance: number;
  nativePriceUsd?: number;
  nativeSymbol: string; // 'SOL' or 'ETH'

  // Legacy Solana fields — keep for backward compat during migration
  solBalance: number;
  solPriceUsd?: number;

  // Token holdings
  tokens: TokenHolding[];
  totalValueUsd?: number;
  change24h?: number;
  earningsToDate?: number;
}
```

### Step 3: Update PortfolioPoint interface

Current:
```typescript
export interface PortfolioPoint {
  t: number;
  p: number;
  sol: number;
  tokens: number;
}
```

Update to:
```typescript
export interface PortfolioPoint {
  t: number;      // timestamp ms
  p: number;      // total portfolio value usd
  native: number; // native token value usd (SOL or ETH)
  tokens: number; // token value usd
  // Legacy field — keep for backward compat
  sol: number;
}
```

### Step 4: Update SwapQuote to include chain

Add `chain` field to SwapQuote:
```typescript
export interface SwapQuote {
  chain: ChainType;
  inputMint: string;   // token address (mint on Solana, contract address on Base)
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  platformFee?: { amount: string; feeBps: number };
  raw: any;            // raw response from Jupiter (Solana) or Uniswap/0x (Base)
}
```

### Step 5: Add OnrampUrlResponse chain field

```typescript
export interface OnrampUrlResponse {
  url: string;
  provider: OnrampProvider;
  coin: string;
  walletAddress: string;
  chain: ChainType;
}
```

### Step 6: Add User wallet fields to User interface

The current `User` interface has `walletAddress: string`. Add:
```typescript
export interface User {
  // ... existing fields ...
  walletAddress: string;          // Solana address (existing)
  baseWalletAddress?: string;     // Base/ETH address (new)
  primaryChain?: ChainType;       // User preference (new)
  // ... rest of existing fields ...
}
```

Insert the two new fields immediately after the `walletAddress` line.

### Step 7: Add Base chain constants to constants.ts

Add the following to `packages/shared/src/constants.ts`:

```typescript
// Chain configuration
export const CHAIN_CONFIG = {
  solana: {
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    nativeIcon: '◎',
    iconColor: '#9945FF',
    explorerUrl: 'https://solscan.io',
    explorerName: 'Solscan',
    usdcAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    usdcDecimals: 6,
    addressRegex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    addressPrefix: '',
  },
  base: {
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    nativeIcon: 'Ξ',
    iconColor: '#0052FF',
    explorerUrl: 'https://basescan.org',
    explorerName: 'BaseScan',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcDecimals: 6,
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPrefix: '0x',
  },
} as const;

export type ChainConfig = typeof CHAIN_CONFIG;
```

### Step 8: Ensure all new types are exported

Verify `packages/shared/src/index.ts` still exports everything (it uses `export *` so this should work automatically).

---

## Verification Checklist

After making changes, verify:

1. **TypeScript compiles**: Run `cd packages/shared && npx tsc --noEmit` — should produce zero errors
2. **All existing types still exist**: `WalletBalance` still has `solBalance`, `solPriceUsd` fields
3. **New types are exported**: Create a quick test file that imports `ChainType`, `CHAIN_CONFIG` from `@momento/shared`
4. **No breaking changes**: The old fields are all preserved. New fields are either optional or have defaults
5. **ChainType is 'solana' | 'base'**: Not an enum, a union type (simpler, JSON-serializable)

## What to Commit
```
feat(shared): add multi-chain types and Base chain constants

- Add ChainType union type ('solana' | 'base')
- Add chain field to WalletBalance, SwapQuote, OnrampUrlResponse
- Add baseWalletAddress and primaryChain to User interface
- Add CHAIN_CONFIG with Solana and Base chain metadata
- Preserve all existing fields for backward compatibility
```
