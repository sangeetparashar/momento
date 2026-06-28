> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Agent 3: Environment & Config

## Mission
Add Base chain environment variables and configuration to both the API and mobile apps. This agent touches ONLY config/env files — no business logic.

## Files to Read First
- `apps/api/.env.development` — current API env vars
- `apps/api/.env.local.example` — env var template
- `apps/mobile/src/config/env.ts` — mobile env config
- `apps/mobile/.env.development` — mobile env vars
- `apps/mobile/.env.example` — mobile env template

## Files to Modify
- `apps/api/.env.local.example`
- `apps/mobile/src/config/env.ts`
- `apps/mobile/.env.example`

## Files to Create
- (none)

---

## Detailed Instructions

### Step 1: Update API env template

In `apps/api/.env.local.example`, add after the existing `HELIUS_API_KEY` line:

```bash
# Base Chain (Ethereum L2)
BASE_RPC_URL=https://mainnet.base.org
BASE_CHAIN_ID=8453
# Optional: Alchemy API key for Base token balances
ALCHEMY_API_KEY=
# Optional: 0x API key for Base swaps (get from https://0x.org/docs)
ZEROX_API_KEY=
# Base fee wallet (0x address for collecting platform fees)
BASE_FEE_WALLET=
```

### Step 2: Update Mobile env config

In `apps/mobile/src/config/env.ts`, the current config is:

```typescript
export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001',
  PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  SOLANA_NETWORK: (process.env.EXPO_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta',
  IS_DEV: __DEV__,
};
```

Replace with:

```typescript
export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001',
  PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',

  // Solana
  SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  SOLANA_NETWORK: (process.env.EXPO_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta',

  // Base
  BASE_RPC_URL: process.env.EXPO_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org',
  BASE_CHAIN_ID: parseInt(process.env.EXPO_PUBLIC_BASE_CHAIN_ID ?? '8453', 10),
  BASE_NETWORK: (process.env.EXPO_PUBLIC_BASE_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet',

  IS_DEV: __DEV__,
};
```

### Step 3: Update Mobile env template

In `apps/mobile/.env.example`, add:

```bash
# Base Chain
EXPO_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
EXPO_PUBLIC_BASE_CHAIN_ID=8453
EXPO_PUBLIC_BASE_NETWORK=mainnet
```

### Step 4: Update .env.development for mobile

In `apps/mobile/.env.development`, add:

```bash
EXPO_PUBLIC_BASE_RPC_URL=https://sepolia.base.org
EXPO_PUBLIC_BASE_CHAIN_ID=84532
EXPO_PUBLIC_BASE_NETWORK=testnet
```

Note: Base Sepolia (testnet) chain ID is 84532.

---

## Verification Checklist

1. **Mobile env.ts compiles**: `cd apps/mobile && npx tsc --noEmit` on env.ts — no errors
2. **All new env vars have sensible defaults**: BASE_RPC_URL defaults to public Base RPC
3. **No existing env vars changed**: Solana config is untouched
4. **Example files updated**: Developers can see what's needed

## What to Commit
```
feat(config): add Base chain environment variables

- Add BASE_RPC_URL, BASE_CHAIN_ID, ALCHEMY_API_KEY to API env template
- Add EXPO_PUBLIC_BASE_* vars to mobile config
- Default to Base mainnet RPC (public endpoint)
- Use Base Sepolia for development
```
