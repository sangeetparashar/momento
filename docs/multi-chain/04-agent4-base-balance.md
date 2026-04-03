# Agent 4: Base Balance Library + Route

## Mission
Create a new `lib/base.ts` library for fetching Base chain balances (ETH + ERC-20 tokens) and update the balance API route to be chain-aware.

## Prerequisites
- Agent 1 (shared types with `ChainType`) must be merged
- Agent 2 (database schema with `baseWalletAddress` + auth helpers) must be merged

## Files to Read First
- `apps/api/lib/helius.ts` — current Solana balance fetching (this is the pattern to follow)
- `apps/api/app/api/wallet/balance/route.ts` — current balance endpoint
- `apps/api/lib/auth.ts` — for `getWalletForChain()` and `getChainParam()`
- `apps/api/lib/redis.ts` — caching patterns
- `packages/shared/src/types.ts` — WalletBalance type (after Agent 1)

## Files to Create
- `apps/api/lib/base.ts` — NEW: Base chain balance fetching

## Files to Modify
- `apps/api/app/api/wallet/balance/route.ts`
- `apps/api/lib/redis.ts` (add cache keys for Base)

---

## Detailed Instructions

### Step 1: Create `apps/api/lib/base.ts`

This file is the Base chain equivalent of `helius.ts`. It provides ETH balance and ERC-20 token balance fetching.

**RESEARCH REQUIRED**: The agent needs to determine the best approach for Base chain balance fetching. Two options:

**Option A: Direct RPC calls (simpler, no extra API key)**
Use `eth_getBalance` for ETH and multicall for ERC-20 balances. This requires knowing which token contracts to check.

**Option B: Alchemy API (richer, requires API key)**
Use Alchemy's `alchemy_getTokenBalances` endpoint which returns ALL ERC-20 balances in one call.

**Recommended: Option A with a known token list**, falling back to Option B if Alchemy key is configured.

```typescript
// apps/api/lib/base.ts

import type { TokenHolding, WalletBalance } from '@momento/shared';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

// Well-known Base chain tokens to check balances for
const BASE_TOKENS: Array<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId?: string;
}> = [
  {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
  {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    coingeckoId: 'dai',
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    coingeckoId: 'weth',
  },
];

/**
 * Make a JSON-RPC call to the Base chain.
 */
async function baseRpc(method: string, params: any[]): Promise<any> {
  const url = ALCHEMY_API_KEY
    ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : BASE_RPC_URL;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Base RPC error: ${json.error.message}`);
  }
  return json.result;
}

/**
 * Get ETH balance for a wallet on Base chain.
 * Returns balance in ETH (not wei).
 */
export async function getEthBalance(walletAddress: string): Promise<number> {
  const result = await baseRpc('eth_getBalance', [walletAddress, 'latest']);
  // result is hex string of wei
  const wei = BigInt(result);
  return Number(wei) / 1e18;
}

/**
 * Get ERC-20 token balance for a specific token.
 * Uses eth_call with balanceOf(address).
 */
async function getErc20Balance(
  tokenAddress: string,
  walletAddress: string,
  decimals: number
): Promise<number> {
  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0');

  const result = await baseRpc('eth_call', [
    { to: tokenAddress, data },
    'latest',
  ]);

  if (!result || result === '0x') return 0;
  const rawBalance = BigInt(result);
  return Number(rawBalance) / Math.pow(10, decimals);
}

/**
 * Get all known ERC-20 token balances on Base.
 * If Alchemy is configured, uses alchemy_getTokenBalances for discovery.
 * Otherwise, checks a known list of popular Base tokens.
 */
export async function getTokenBalances(walletAddress: string): Promise<TokenHolding[]> {
  // If Alchemy is available, use their token balance API for broader discovery
  if (ALCHEMY_API_KEY) {
    return getTokenBalancesAlchemy(walletAddress);
  }
  return getTokenBalancesKnownList(walletAddress);
}

/**
 * Check balances for known token list (no API key required).
 */
async function getTokenBalancesKnownList(walletAddress: string): Promise<TokenHolding[]> {
  const holdings: TokenHolding[] = [];

  const balancePromises = BASE_TOKENS.map(async (token) => {
    const amount = await getErc20Balance(token.address, walletAddress, token.decimals);
    if (amount > 0) {
      holdings.push({
        mint: token.address,
        symbol: token.symbol,
        name: token.name,
        amount,
        decimals: token.decimals,
        priceUsd: token.symbol === 'USDC' ? 1.0 : undefined,
        valueUsd: token.symbol === 'USDC' ? amount : undefined,
      });
    }
  });

  await Promise.all(balancePromises);
  return holdings;
}

/**
 * Use Alchemy's alchemy_getTokenBalances for comprehensive token discovery.
 */
async function getTokenBalancesAlchemy(walletAddress: string): Promise<TokenHolding[]> {
  const url = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [walletAddress],
    }),
  });

  const json = await res.json();
  if (json.error || !json.result?.tokenBalances) {
    console.error('Alchemy token balance error:', json.error);
    return getTokenBalancesKnownList(walletAddress); // fallback
  }

  const holdings: TokenHolding[] = [];

  for (const tb of json.result.tokenBalances) {
    if (tb.tokenBalance === '0x0' || tb.tokenBalance === '0x') continue;

    const rawBalance = BigInt(tb.tokenBalance);
    if (rawBalance === 0n) continue;

    // Look up token metadata
    const known = BASE_TOKENS.find(
      (t) => t.address.toLowerCase() === tb.contractAddress.toLowerCase()
    );

    const decimals = known?.decimals ?? 18;
    const amount = Number(rawBalance) / Math.pow(10, decimals);

    holdings.push({
      mint: tb.contractAddress,
      symbol: known?.symbol ?? 'UNKNOWN',
      name: known?.name ?? 'Unknown Token',
      amount,
      decimals,
      priceUsd: known?.symbol === 'USDC' ? 1.0 : undefined,
      valueUsd: known?.symbol === 'USDC' ? amount : undefined,
    });
  }

  return holdings;
}

/**
 * Fetch ETH price in USD from CoinGecko.
 */
async function getEthPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { next: { revalidate: 60 } } as any
    );
    const json = await res.json();
    return json.ethereum?.usd ?? 0;
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    return 0;
  }
}

/**
 * Fetch complete wallet balance for Base chain.
 * Equivalent to fetchWalletBalance() in helius.ts.
 */
export async function fetchBaseWalletBalance(walletAddress: string): Promise<WalletBalance> {
  const [ethBalance, tokens, ethPriceUsd] = await Promise.all([
    getEthBalance(walletAddress),
    getTokenBalances(walletAddress),
    getEthPriceUsd(),
  ]);

  const ethValueUsd = ethBalance * ethPriceUsd;
  const tokenValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);
  const totalValueUsd = ethValueUsd + tokenValueUsd;

  return {
    chain: 'base',
    nativeBalance: ethBalance,
    nativePriceUsd: ethPriceUsd,
    nativeSymbol: 'ETH',

    // Legacy fields for backward compat
    solBalance: 0,
    solPriceUsd: 0,

    tokens,
    totalValueUsd,
    change24h: 0, // TODO: implement 24h change tracking for Base
  };
}
```

### Step 2: Update Balance Route

In `apps/api/app/api/wallet/balance/route.ts`, update the GET handler to be chain-aware.

**Current logic (simplified):**
```typescript
export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  // ... check walletAddress not pending
  const balance = await fetchWalletBalance(walletAddress);
  return NextResponse.json({ success: true, data: balance });
}
```

**Updated logic:**
```typescript
import { getChainParam, getWalletForChain } from '@/lib/auth';
import { fetchWalletBalance } from '@/lib/helius';
import { fetchBaseWalletBalance } from '@/lib/base';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  const chain = getChainParam(request);

  const walletAddress = getWalletForChain(user, chain);

  if (!walletAddress) {
    return NextResponse.json({
      success: true,
      data: {
        chain,
        nativeBalance: 0,
        nativePriceUsd: 0,
        nativeSymbol: chain === 'base' ? 'ETH' : 'SOL',
        solBalance: 0,
        solPriceUsd: 0,
        tokens: [],
        totalValueUsd: 0,
        change24h: 0,
        earningsToDate: 0,
      },
    });
  }

  let balance;
  if (chain === 'base') {
    balance = await fetchBaseWalletBalance(walletAddress);
  } else {
    balance = await fetchWalletBalance(walletAddress);
    // Ensure legacy Solana balance also has the new chain-aware fields
    balance.chain = 'solana';
    balance.nativeBalance = balance.solBalance;
    balance.nativePriceUsd = balance.solPriceUsd ?? 0;
    balance.nativeSymbol = 'SOL';
  }

  // Record portfolio snapshot (fire-and-forget)
  recordSnapshot(user.id, chain, balance).catch(() => {});

  return NextResponse.json({ success: true, data: balance });
}
```

### Step 3: Update Redis Cache Keys

In `apps/api/lib/redis.ts`, find the `cacheKeys` object and add chain-specific keys:

```typescript
// Add alongside existing wallet cache key
walletBalance: (userId: string, chain: string = 'solana') =>
  `wallet:balance:${chain}:${userId}`,
```

Update anywhere `cacheKeys.walletBalance` is called to pass the chain parameter.

---

## Research Required

1. **Base RPC endpoints**: Verify `https://mainnet.base.org` is the correct public RPC. For testnet (Base Sepolia), use `https://sepolia.base.org`.
2. **USDC on Base**: Verify the USDC contract address `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` is correct for Base mainnet.
3. **Alchemy Base support**: Verify Alchemy supports `alchemy_getTokenBalances` on Base chain. URL format: `https://base-mainnet.g.alchemy.com/v2/{key}`.
4. **CoinGecko ETH price**: Verify the CoinGecko endpoint for ETH price (same as Ethereum mainnet — `ids=ethereum`).

---

## Verification Checklist

1. **New file exists**: `apps/api/lib/base.ts` with all exported functions
2. **Balance route handles `?chain=base`**: Returns Base wallet balance when chain=base
3. **Balance route still works without chain param**: Defaults to Solana (backward compat)
4. **Empty balance for missing wallet**: If user has no Base wallet, returns zero balance
5. **Cache keys are chain-specific**: Solana and Base balances cached separately
6. **TypeScript compiles**: `cd apps/api && npx tsc --noEmit` — zero errors
7. **No Solana imports in base.ts**: The file should NOT import any `@solana/*` packages

## What to Commit
```
feat(api): add Base chain balance fetching library and chain-aware balance route

- Create lib/base.ts with ETH balance + ERC-20 token balance fetching
- Support both direct RPC and Alchemy API for token discovery
- Update balance route to accept ?chain=base|solana parameter
- Add chain-specific Redis cache keys
- Default to Solana for backward compatibility
```
