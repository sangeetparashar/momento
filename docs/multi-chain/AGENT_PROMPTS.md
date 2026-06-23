> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Executable Agent Prompts

This document contains the **exact prompts** the orchestrator should send to each sub-agent. Each prompt is self-contained — the agent receives ONLY this prompt and has access to the full repo in an isolated worktree.

**How to use**: Copy the prompt for the relevant agent and pass it as the `prompt` parameter to the Agent tool with `isolation: "worktree"`.

---

## PHASE 1 — Foundation (all 3 run in parallel)

---

### AGENT 1 PROMPT: Shared Types & Constants

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to update the shared types package.

CONTEXT: This is a monorepo with packages/shared/ containing shared TypeScript types used by both the API (apps/api/) and mobile app (apps/mobile/). Currently everything is Solana-only. We are adding Base Chain (Ethereum L2) as a second chain option.

YOUR TASK: Update packages/shared/src/types.ts and packages/shared/src/constants.ts to add multi-chain type definitions.

STEP-BY-STEP:

1. Read these files first:
   - packages/shared/src/types.ts
   - packages/shared/src/constants.ts
   - packages/shared/src/index.ts

2. In types.ts, add after the existing enums (after line ~12):
   export type ChainType = 'solana' | 'base';

3. In types.ts, find the User interface. Add TWO new fields immediately after the `walletAddress: string;` line:
   baseWalletAddress?: string;
   primaryChain?: ChainType;

4. In types.ts, find the WalletBalance interface. Add THREE new fields at the TOP of the interface (before solBalance):
   chain: ChainType;
   nativeBalance: number;
   nativePriceUsd?: number;
   nativeSymbol: string;
   Keep ALL existing fields (solBalance, solPriceUsd, etc.) — they are needed for backward compatibility.

5. In types.ts, find the PortfolioPoint interface. Add a new field after `p`:
   native: number;
   Keep the existing `sol: number` field.

6. In types.ts, find SwapQuote. Add at the TOP of the interface:
   chain: ChainType;

7. In types.ts, find OnrampUrlResponse. Add at the bottom:
   chain: ChainType;

8. In constants.ts, add the following AFTER the existing SOCIAL_PLATFORMS:

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
  },
} as const;

export type ChainConfig = typeof CHAIN_CONFIG;

VERIFICATION:
- Run: cd packages/shared && npx tsc --noEmit
- Must compile with zero errors
- All existing types must still exist unchanged
- New types are exported via the existing export * in index.ts

COMMIT with message:
feat(shared): add multi-chain types and Base chain constants
```

---

### AGENT 2 PROMPT: Database Schema & Server Auth

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to update the database schema and server-side auth to support both Solana and Base wallet addresses.

CONTEXT: Users currently have a single `walletAddress` (Solana). We're adding a second wallet address for Base chain (Ethereum L2, 0x format). The auth module creates users on first login by fetching wallet info from Privy.

STEP-BY-STEP:

1. Read these files first:
   - apps/api/prisma/schema.prisma (full file)
   - apps/api/lib/auth.ts (full file)

2. UPDATE PRISMA SCHEMA (apps/api/prisma/schema.prisma):

   In the User model, add TWO new fields after `walletAddress String @unique`:
   baseWalletAddress String?   @unique
   primaryChain      String    @default("solana")

   In the PortfolioSnapshot model, add ONE new field after `userId`:
   chain          String   @default("solana")
   
   Also add a new index to PortfolioSnapshot:
   @@index([userId, chain, createdAt])

3. CREATE MIGRATION SQL:
   Create file: apps/api/prisma/migrations/20260404000000_add_base_wallet_support/migration.sql
   
   Content:
   -- AlterTable
   ALTER TABLE "users" ADD COLUMN "baseWalletAddress" TEXT,
   ADD COLUMN "primaryChain" TEXT NOT NULL DEFAULT 'solana';
   CREATE UNIQUE INDEX "users_baseWalletAddress_key" ON "users"("baseWalletAddress");
   
   ALTER TABLE "portfolio_snapshots" ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'solana';
   CREATE INDEX "portfolio_snapshots_userId_chain_createdAt_idx" ON "portfolio_snapshots"("userId", "chain", "createdAt");

4. UPDATE AUTH INTERFACE (apps/api/lib/auth.ts):

   Update the AuthUser interface to add:
   baseWalletAddress: string | null;
   primaryChain: string;

5. UPDATE getAuthUser() FUNCTION:

   IMPORTANT RESEARCH STEP: Before modifying the code, check the Privy server SDK types:
   - Run: grep -r "linkedAccounts\|wallet\|chainType\|walletType" node_modules/@privy-io/server-auth/dist/ --include="*.d.ts" | head -40
   - This tells you the exact field names Privy uses for linked wallet accounts.
   
   The current code uses `privyUser.wallet?.address` which returns only the FIRST wallet.
   To get BOTH wallets, you need to iterate `privyUser.linkedAccounts` (or similar).
   
   Based on what you find, update the user creation block in getAuthUser() to:
   a) Extract the Solana wallet address from linked accounts
   b) Extract the Ethereum/Base wallet address from linked accounts  
   c) Store both in the database
   d) Set primaryChain based on which wallets exist
   
   If you cannot determine the exact Privy API shape, use this fallback:
   - Keep existing `privyUser.wallet?.address` for Solana
   - Use `privyUser.linkedAccounts?.find(a => a.type === 'wallet' && a.chainType === 'ethereum')?.address` for ETH
   - Add a comment: // TODO: verify Privy linkedAccounts API shape

   Also update the "pending wallet sync" block to sync BOTH wallet types.

6. UPDATE ALL PRISMA SELECT CLAUSES in auth.ts:
   Find every `select: { id: true, ...}` block (there are 3) and add:
   baseWalletAddress: true,
   primaryChain: true,

7. ADD HELPER FUNCTIONS at the bottom of auth.ts:

   export function getWalletForChain(user: AuthUser, chain: string): string | null {
     if (chain === 'base') {
       return user.baseWalletAddress || null;
     }
     const addr = user.walletAddress;
     return addr && !addr.startsWith('pending-') ? addr : null;
   }

   export function getChainParam(request: NextRequest): 'solana' | 'base' {
     const url = new URL(request.url);
     const chain = url.searchParams.get('chain');
     if (chain === 'base') return 'base';
     return 'solana';
   }

VERIFICATION:
- Run: cd apps/api && npx prisma validate (zero errors)
- Run: cd apps/api && npx tsc --noEmit (zero errors)
- AuthUser interface has baseWalletAddress and primaryChain
- getWalletForChain and getChainParam are exported
- Migration SQL file exists

COMMIT with message:
feat(api): add multi-chain database schema and auth support
```

---

### AGENT 3 PROMPT: Environment & Config

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to add Base chain environment variables to both the API and mobile apps.

STEP-BY-STEP:

1. Read these files first:
   - apps/api/.env.local.example
   - apps/mobile/src/config/env.ts
   - apps/mobile/.env.example
   - apps/mobile/.env.development
   - apps/mobile/.env.production (if it exists)

2. In apps/api/.env.local.example, add after the HELIUS_API_KEY line:

   # Base Chain (Ethereum L2)
   BASE_RPC_URL=https://mainnet.base.org
   BASE_CHAIN_ID=8453
   ALCHEMY_API_KEY=
   ZEROX_API_KEY=
   BASE_FEE_WALLET=

3. In apps/mobile/src/config/env.ts, add THREE new properties to the ENV object:

   // Base
   BASE_RPC_URL: process.env.EXPO_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org',
   BASE_CHAIN_ID: parseInt(process.env.EXPO_PUBLIC_BASE_CHAIN_ID ?? '8453', 10),
   BASE_NETWORK: (process.env.EXPO_PUBLIC_BASE_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet',

   Add these BEFORE the IS_DEV line. Keep all existing properties unchanged.

4. In apps/mobile/.env.example, add:

   EXPO_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
   EXPO_PUBLIC_BASE_CHAIN_ID=8453
   EXPO_PUBLIC_BASE_NETWORK=mainnet

5. In apps/mobile/.env.development, add:

   EXPO_PUBLIC_BASE_RPC_URL=https://sepolia.base.org
   EXPO_PUBLIC_BASE_CHAIN_ID=84532
   EXPO_PUBLIC_BASE_NETWORK=testnet

6. If apps/mobile/.env.production exists, add:

   EXPO_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
   EXPO_PUBLIC_BASE_CHAIN_ID=8453
   EXPO_PUBLIC_BASE_NETWORK=mainnet

VERIFICATION:
- Run: cd apps/mobile && npx tsc --noEmit (zero errors on env.ts)
- All existing env vars are unchanged
- New vars have sensible defaults

COMMIT with message:
feat(config): add Base chain environment variables
```

---
