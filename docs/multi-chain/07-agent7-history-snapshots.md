# Agent 7: History & Snapshots Routes

## Mission
Update the price history and portfolio snapshot API routes to support Base chain. History needs ETH price data. Snapshots need to be chain-aware.

## Prerequisites
- Agent 1 (shared types) must be merged
- Agent 2 (database schema with chain field on PortfolioSnapshot) must be merged

## Files to Read First
- `apps/api/app/api/wallet/history/route.ts` — current SOL price history
- `apps/api/app/api/wallet/snapshots/route.ts` — current portfolio snapshots
- `apps/api/lib/redis.ts` — caching patterns
- `apps/api/lib/auth.ts` — for `getChainParam()`

## Files to Modify
- `apps/api/app/api/wallet/history/route.ts`
- `apps/api/app/api/wallet/snapshots/route.ts`
- `apps/api/lib/redis.ts` (add cache keys)

---

## Detailed Instructions

### Step 1: Update History Route

The current history route fetches SOL price history from CoinGecko. For Base chain, we fetch ETH price history instead.

**Current logic (simplified):**
```typescript
// Fetches: https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=30
// Returns: PricePoint[] = [{ t: timestamp, p: price }, ...]
```

**Updated logic:**
```typescript
import { getChainParam } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // ... existing auth + rate limit ...
  const chain = getChainParam(request);
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '1M';

  const daysMap: Record<string, number> = {
    '24H': 1, '7D': 7, '1M': 30, '3M': 90, '1Y': 365,
  };
  const days = daysMap[range] || 30;

  // CoinGecko coin ID based on chain
  const coinId = chain === 'base' ? 'ethereum' : 'solana';
  const cacheKey = `price:history:${coinId}:${range}`;

  // Check cache first
  // ... existing cache logic, but use chain-specific cache key ...

  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
  );
  const json = await res.json();

  const prices: PricePoint[] = (json.prices || []).map(([t, p]: [number, number]) => ({
    t,
    p,
  }));

  // ... cache result with chain-specific key ...

  return NextResponse.json({ success: true, data: prices });
}
```

**Key change**: Just swap `solana` for `ethereum` in the CoinGecko URL when `chain === 'base'`. Base uses ETH for gas, so ETH price history is what we want.

### Step 2: Update Snapshots Route

The snapshots route returns portfolio history data. Update it to filter by chain.

```typescript
import { getChainParam } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  const chain = getChainParam(request);
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '1M';

  const daysMap: Record<string, number> = {
    '24H': 1, '7D': 7, '1M': 30, '3M': 90, '1Y': 365,
  };
  const days = daysMap[range] || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      userId: user.id,
      chain,           // NEW: filter by chain
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      totalValueUsd: true,
      solBalance: true,
      solValueUsd: true,
      tokenValueUsd: true,
      createdAt: true,
    },
  });

  const points: PortfolioPoint[] = snapshots.map((s) => ({
    t: s.createdAt.getTime(),
    p: s.totalValueUsd,
    native: s.solValueUsd,  // This field holds native token value (SOL or ETH)
    sol: s.solValueUsd,     // Legacy field
    tokens: s.tokenValueUsd,
  }));

  return NextResponse.json({ success: true, data: points });
}
```

### Step 3: Update Redis Cache Keys

In `apps/api/lib/redis.ts`, update or add:

```typescript
// In cacheKeys object:
priceHistory: (coinId: string, range: string) =>
  `price:history:${coinId}:${range}`,

portfolioSnapshots: (userId: string, chain: string, range: string) =>
  `portfolio:snapshots:${chain}:${userId}:${range}`,
```

### Step 4: Update Snapshot Recording

Find where `PortfolioSnapshot` records are created (likely in the balance route or a helper function). Ensure the `chain` field is included:

```typescript
// When recording a snapshot, include chain:
await prisma.portfolioSnapshot.create({
  data: {
    userId,
    chain,                          // NEW
    totalValueUsd: balance.totalValueUsd ?? 0,
    solBalance: balance.nativeBalance ?? balance.solBalance,
    solValueUsd: (balance.nativeBalance ?? balance.solBalance) * (balance.nativePriceUsd ?? balance.solPriceUsd ?? 0),
    tokenValueUsd: balance.tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0),
  },
});
```

---

## Verification Checklist

1. **History route handles `?chain=base`**: Returns ETH price history from CoinGecko
2. **History route backward compat**: Without chain param, returns SOL price history
3. **Snapshots filtered by chain**: Only returns snapshots for the requested chain
4. **Snapshot recording includes chain**: New snapshots have the chain field set
5. **Cache keys are chain-specific**: Different cache entries for Solana vs Base
6. **TypeScript compiles**: `cd apps/api && npx tsc --noEmit` — zero errors

## What to Commit
```
feat(api): add chain-aware price history and portfolio snapshots

- Update history route to fetch ETH price for Base chain via CoinGecko
- Filter portfolio snapshots by chain field
- Include chain in snapshot recording
- Add chain-specific Redis cache keys
- Preserve Solana history as default
```
