# Agent 5: Base Swap Library + Route

## Mission
Create a new `lib/base-swap.ts` library for token swaps on Base chain (via 0x API or Uniswap) and update the swap API route to be chain-aware.

## Prerequisites
- Agent 1 (shared types) must be merged
- Agent 2 (database schema + auth helpers) must be merged

## Files to Read First
- `apps/api/lib/jupiter.ts` — current Solana swap logic (pattern to follow)
- `apps/api/app/api/wallet/swap/route.ts` — current swap endpoint
- `apps/api/lib/auth.ts` — for `getWalletForChain()` and `getChainParam()`
- `packages/shared/src/types.ts` — SwapQuote type (after Agent 1)
- `packages/shared/src/constants.ts` — CHAIN_CONFIG for Base token addresses

## Files to Create
- `apps/api/lib/base-swap.ts` — NEW: Base chain swap via 0x API

## Files to Modify
- `apps/api/app/api/wallet/swap/route.ts`

---

## Detailed Instructions

### Step 1: Choose Swap Provider

**RESEARCH REQUIRED**: The agent must decide between these Base swap providers:

| Provider | Pros | Cons |
|----------|------|------|
| **0x API** | Simple REST API, aggregates multiple DEXes, supports Base | Requires API key (free tier available) |
| **Uniswap Universal Router** | Most liquidity on Base, no API key | Complex SDK integration, need to build tx locally |
| **1inch API** | Good aggregation | Rate limits on free tier |

**Recommended: 0x API** — it's the closest equivalent to Jupiter's REST API pattern, making the code most consistent with the existing Solana swap logic.

0x API endpoints:
- Quote: `GET https://base.api.0x.org/swap/v1/quote`
- Price (no tx): `GET https://base.api.0x.org/swap/v1/price`

### Step 2: Create `apps/api/lib/base-swap.ts`

```typescript
// apps/api/lib/base-swap.ts

import type { SwapQuote } from '@momento/shared';
import { CHAIN_CONFIG } from '@momento/shared';

const ZEROX_API_KEY = process.env.ZEROX_API_KEY || '';
const BASE_ZEROX_URL = 'https://base.api.0x.org';
const PLATFORM_FEE_BPS = parseInt(process.env.MOMENTO_PLATFORM_FEE_BPS || '400', 10);
const BASE_FEE_WALLET = process.env.BASE_FEE_WALLET || '';

// Well-known Base token addresses
export const BASE_TOKEN_ADDRESSES = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // 0x native ETH placeholder
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: CHAIN_CONFIG.base.usdcAddress,
} as const;

interface ZeroXQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  price: string;
  estimatedPriceImpact: string;
  to: string;        // contract to call
  data: string;      // calldata
  value: string;     // ETH value to send
  gas: string;       // estimated gas
  gasPrice: string;
  buyTokenAddress: string;
  sellTokenAddress: string;
  allowanceTarget: string; // address to approve for ERC-20
}

/**
 * Get a swap quote from 0x API on Base chain.
 * Equivalent to getSwapQuote() in jupiter.ts.
 */
export async function getBaseSwapQuote(params: {
  sellToken: string;   // token address (or 'ETH' for native)
  buyToken: string;    // token address (or 'ETH' for native)
  sellAmount: string;  // amount in smallest units (wei for ETH, raw for ERC-20)
  slippageBps?: number;
}): Promise<SwapQuote> {
  const { sellToken, buyToken, sellAmount, slippageBps = 50 } = params;

  const slippagePercentage = slippageBps / 10000;

  const queryParams = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount,
    slippagePercentage: slippagePercentage.toString(),
  });

  // Add platform fee if configured
  if (BASE_FEE_WALLET && PLATFORM_FEE_BPS > 0) {
    queryParams.set('buyTokenPercentageFee', (PLATFORM_FEE_BPS / 10000).toString());
    queryParams.set('feeRecipient', BASE_FEE_WALLET);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ZEROX_API_KEY) {
    headers['0x-api-key'] = ZEROX_API_KEY;
  }

  const res = await fetch(`${BASE_ZEROX_URL}/swap/v1/quote?${queryParams}`, {
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`0x API error (${res.status}): ${errorBody}`);
  }

  const data: ZeroXQuoteResponse = await res.json();

  return {
    chain: 'base',
    inputMint: sellToken,
    outputMint: buyToken,
    inAmount: data.sellAmount,
    outAmount: data.buyAmount,
    otherAmountThreshold: data.buyAmount, // 0x handles slippage internally
    priceImpactPct: data.estimatedPriceImpact || '0',
    platformFee: BASE_FEE_WALLET && PLATFORM_FEE_BPS > 0
      ? { amount: '0', feeBps: PLATFORM_FEE_BPS } // 0x includes fee in buyAmount
      : undefined,
    raw: data, // Full 0x response — mobile client needs `to`, `data`, `value`, `gas`
  };
}

/**
 * Build a swap transaction for Base chain.
 * Unlike Solana (where we build a VersionedTransaction), for EVM chains
 * the 0x API returns the transaction data directly in the quote response.
 *
 * Returns the transaction parameters that the mobile client will use
 * to construct and sign the transaction via the Privy ETH wallet provider.
 */
export async function buildBaseSwapTransaction(params: {
  quoteResponse: ZeroXQuoteResponse;
  userAddress: string;
}): Promise<{
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
  chainId: number;
  from: string;
  allowanceTarget?: string;
  sellTokenAddress?: string;
}> {
  const { quoteResponse, userAddress } = params;

  return {
    to: quoteResponse.to,
    data: quoteResponse.data,
    value: quoteResponse.value,
    gas: quoteResponse.gas,
    gasPrice: quoteResponse.gasPrice,
    chainId: 8453, // Base mainnet
    from: userAddress,
    // Client needs to check if ERC-20 approval is needed
    allowanceTarget: quoteResponse.allowanceTarget,
    sellTokenAddress: quoteResponse.sellTokenAddress,
  };
}
```

### Step 3: Update Swap Route

In `apps/api/app/api/wallet/swap/route.ts`, update both GET and POST handlers.

**GET handler (quote):**

```typescript
import { getChainParam, getWalletForChain } from '@/lib/auth';
import { getSwapQuote } from '@/lib/jupiter';
import { getBaseSwapQuote, BASE_TOKEN_ADDRESSES } from '@/lib/base-swap';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  const chain = getChainParam(request);
  const url = new URL(request.url);

  if (chain === 'base') {
    const sellToken = url.searchParams.get('sellToken') || url.searchParams.get('inputMint') || '';
    const buyToken = url.searchParams.get('buyToken') || url.searchParams.get('outputMint') || '';
    const sellAmount = url.searchParams.get('sellAmount') || url.searchParams.get('amount') || '';
    const slippageBps = parseInt(url.searchParams.get('slippageBps') || '50', 10);

    const quote = await getBaseSwapQuote({
      sellToken,
      buyToken,
      sellAmount,
      slippageBps,
    });

    return NextResponse.json({ success: true, data: quote });
  }

  // Existing Solana logic (unchanged)
  const inputMint = url.searchParams.get('inputMint') || '';
  const outputMint = url.searchParams.get('outputMint') || '';
  const amount = url.searchParams.get('amount') || '';
  const slippageBps = parseInt(url.searchParams.get('slippageBps') || '50', 10);

  const quote = await getSwapQuote({ inputMint, outputMint, amount, slippageBps });
  return NextResponse.json({ success: true, data: quote });
}
```

**POST handler (build transaction):**

```typescript
export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  const body = await request.json();
  const chain = body.chain || 'solana';

  if (chain === 'base') {
    const walletAddress = getWalletForChain(user, 'base');
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'No Base wallet found' },
        { status: 400 }
      );
    }

    const txParams = await buildBaseSwapTransaction({
      quoteResponse: body.quoteResponse,
      userAddress: walletAddress,
    });

    return NextResponse.json({ success: true, data: txParams });
  }

  // Existing Solana logic (unchanged)
  // ... keep all existing Jupiter swap logic ...
}
```

### Important: ERC-20 Approval Flow

Unlike Solana SPL tokens, ERC-20 swaps require a TWO-STEP process:

1. **Approve**: User must approve the swap router to spend their tokens
2. **Swap**: Execute the actual swap

The `allowanceTarget` in the 0x response tells the client which address to approve. The mobile client (Agent 10) will need to handle this. Document this in the response:

```typescript
// In the POST response for Base swaps, include:
{
  success: true,
  data: {
    ...txParams,
    // Flag to tell client about approval requirement
    requiresApproval: sellTokenAddress !== BASE_TOKEN_ADDRESSES.ETH,
    approvalTarget: allowanceTarget,
  }
}
```

---

## Research Required

1. **0x API on Base**: Verify the endpoint `https://base.api.0x.org/swap/v1/quote` is correct and active. Check https://0x.org/docs for the latest Base chain support.
2. **0x API key**: Check if a free tier exists and what rate limits apply. The agent should note this in comments.
3. **Fee recipient format**: Verify 0x supports `buyTokenPercentageFee` + `feeRecipient` parameters for platform fees.
4. **Native ETH representation**: 0x uses `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` as the native ETH address. Verify this.
5. **ERC-20 approval**: Understand the approval flow. The 0x quote response includes `allowanceTarget` — the client must call `approve(allowanceTarget, amount)` on the sell token before executing the swap (unless selling native ETH).

---

## Verification Checklist

1. **New file exists**: `apps/api/lib/base-swap.ts` with all exported functions
2. **Swap route handles `?chain=base`**: GET returns 0x quote, POST returns tx params
3. **Swap route still works without chain param**: Defaults to Solana (backward compat)
4. **Quote response matches SwapQuote type**: All fields populated correctly
5. **ERC-20 approval info included**: Response includes `requiresApproval` and `approvalTarget`
6. **TypeScript compiles**: `cd apps/api && npx tsc --noEmit` — zero errors
7. **No Solana imports in base-swap.ts**: File should NOT import `@solana/*` packages

## What to Commit
```
feat(api): add Base chain swap library via 0x API and chain-aware swap route

- Create lib/base-swap.ts with 0x API integration for Base chain swaps
- Support platform fee collection via 0x feeRecipient parameter
- Update swap route GET/POST to accept chain parameter
- Include ERC-20 approval info in Base swap responses
- Preserve existing Jupiter/Solana swap logic unchanged
```
