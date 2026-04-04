# Agent 6: Base Send + Onramp Routes

## Mission
Update the send and onramp API routes to support Base chain. Send needs to build ETH and ERC-20 transfer transactions. Onramp needs to generate URLs for Base chain fiat purchases.

## Prerequisites
- Agent 1 (shared types) must be merged
- Agent 2 (database schema + auth helpers) must be merged

## Files to Read First
- `apps/api/app/api/wallet/send/route.ts` — current Solana send logic
- `apps/api/app/api/wallet/onramp/route.ts` — current onramp logic
- `apps/api/lib/auth.ts` — for `getWalletForChain()`, `getChainParam()`
- `packages/shared/src/constants.ts` — CHAIN_CONFIG for Base addresses

## Files to Modify
- `apps/api/app/api/wallet/send/route.ts`
- `apps/api/app/api/wallet/onramp/route.ts`

---

## Detailed Instructions

### PART A: Send Route

### Step 1: Understand Current Send Logic

The current `POST /api/wallet/send` does:
1. Parse `{ recipientAddress, amount, token: 'SOL' | 'USDC' }` from body
2. Validate inputs
3. Build unsigned Solana transaction (SystemProgram.transfer for SOL, SPL transfer for USDC)
4. Return base64-encoded transaction for client to sign

For Base chain, the pattern is different:
- We return **EVM transaction parameters** (to, value, data, gas) instead of a serialized transaction
- The mobile client uses the Privy ETH wallet provider to sign and send
- ETH transfers are simple value transfers
- ERC-20 transfers require encoding the `transfer(address,uint256)` function call

### Step 2: Add Base Send Logic

Add a new code path in the POST handler. The updated route should look like:

```typescript
import { getWalletForChain } from '@/lib/auth';
import { CHAIN_CONFIG } from '@momento/shared';

export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  const body = await request.json();

  const { recipientAddress, amount, token, chain = 'solana' } = body;

  // --- INPUT VALIDATION (shared) ---
  if (!recipientAddress || typeof recipientAddress !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Invalid recipient address' },
      { status: 400 }
    );
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { success: false, error: 'Invalid amount' },
      { status: 400 }
    );
  }
  if (!['SOL', 'USDC', 'ETH'].includes(token)) {
    return NextResponse.json(
      { success: false, error: 'Unsupported token. Use SOL, ETH, or USDC.' },
      { status: 400 }
    );
  }

  // --- BASE CHAIN ---
  if (chain === 'base') {
    return handleBaseSend(user, recipientAddress, amount, token);
  }

  // --- SOLANA CHAIN (existing logic, unchanged) ---
  // ... keep ALL existing Solana send logic here ...
}

async function handleBaseSend(
  user: AuthUser,
  recipientAddress: string,
  amount: number,
  token: string
) {
  const walletAddress = getWalletForChain(user, 'base');
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'No Base wallet found' },
      { status: 400 }
    );
  }

  // Validate Base address format (0x + 40 hex chars)
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
    return NextResponse.json(
      { success: false, error: 'Invalid Base/Ethereum address' },
      { status: 400 }
    );
  }

  // Prevent self-send
  if (recipientAddress.toLowerCase() === walletAddress.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: 'Cannot send to yourself' },
      { status: 400 }
    );
  }

  if (token === 'ETH') {
    // Native ETH transfer — simple value transfer
    const weiAmount = BigInt(Math.floor(amount * 1e18));

    return NextResponse.json({
      success: true,
      data: {
        chain: 'base',
        transactionType: 'native',
        to: recipientAddress,
        value: '0x' + weiAmount.toString(16),
        from: walletAddress,
        chainId: 8453,
      },
    });
  }

  if (token === 'USDC') {
    // ERC-20 transfer — encode transfer(address, uint256)
    const usdcAddress = CHAIN_CONFIG.base.usdcAddress;
    const usdcDecimals = CHAIN_CONFIG.base.usdcDecimals; // 6
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, usdcDecimals)));

    // Encode: transfer(address,uint256)
    // Function selector: 0xa9059cbb
    const recipientPadded = recipientAddress.slice(2).padStart(64, '0');
    const amountPadded = rawAmount.toString(16).padStart(64, '0');
    const data = '0xa9059cbb' + recipientPadded + amountPadded;

    return NextResponse.json({
      success: true,
      data: {
        chain: 'base',
        transactionType: 'erc20',
        to: usdcAddress,     // Send to the USDC contract
        value: '0x0',        // No ETH value (it's a contract call)
        data,                // Encoded transfer() call
        from: walletAddress,
        chainId: 8453,
      },
    });
  }

  return NextResponse.json(
    { success: false, error: 'Unsupported token for Base chain' },
    { status: 400 }
  );
}
```

**KEY DIFFERENCES from Solana:**
- No serialized transaction — return raw EVM tx params
- No ATA creation needed — ERC-20 `transfer()` sends directly to any address
- Amount encoding: ETH uses wei (18 decimals), USDC uses 6 decimals
- Address validation: `0x` prefix + 40 hex characters

### PART B: Onramp Route

### Step 3: Update Onramp Route

The current onramp route generates URLs for Ramp, MoonPay, and Transak configured for Solana. Add Base chain support.

In `apps/api/app/api/wallet/onramp/route.ts`, update the GET handler:

```typescript
export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'transak';
  const chain = url.searchParams.get('chain') || 'solana';

  // Resolve wallet address for the requested chain
  const walletAddress = getWalletForChain(user, chain);
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: `No ${chain} wallet found` },
      { status: 400 }
    );
  }

  let onrampUrl: string;

  if (provider === 'transak') {
    onrampUrl = await buildTransakUrl(walletAddress, chain);
  } else if (provider === 'moonpay') {
    onrampUrl = buildMoonPayUrl(walletAddress, chain);
  } else {
    onrampUrl = buildRampUrl(walletAddress, chain);
  }

  return NextResponse.json({
    success: true,
    data: {
      url: onrampUrl,
      provider,
      coin: 'USDC',
      walletAddress,
      chain,
    },
  });
}
```

### Step 4: Update Each Provider URL Builder

**Ramp:**
```typescript
function buildRampUrl(walletAddress: string, chain: string): string {
  // Current: swapAsset: 'SOLANA_USDC'
  // Base:    swapAsset: 'BASE_USDC'
  const swapAsset = chain === 'base' ? 'BASE_USDC' : 'SOLANA_USDC';
  const baseUrl = process.env.RAMP_ENVIRONMENT === 'production'
    ? 'https://app.rampnetwork.com'
    : 'https://app.demo.rampnetwork.com';

  const params = new URLSearchParams({
    hostAppName: 'Momento',
    hostLogoUrl: 'https://momento.app/logo.svg',
    swapAsset,
    userAddress: walletAddress,
    hostApiKey: process.env.RAMP_API_KEY || '',
  });

  return `${baseUrl}?${params}`;
}
```

**MoonPay:**
```typescript
function buildMoonPayUrl(walletAddress: string, chain: string): string {
  // Current: currencyCode: 'usdc_sol'
  // Base:    currencyCode: 'usdc_base'
  const currencyCode = chain === 'base' ? 'usdc_base' : 'usdc_sol';
  const baseUrl = process.env.MOONPAY_ENVIRONMENT === 'production'
    ? 'https://buy.moonpay.com'
    : 'https://buy-sandbox.moonpay.com';

  const params = new URLSearchParams({
    apiKey: process.env.MOONPAY_API_KEY || '',
    currencyCode,
    walletAddress,
    colorCode: '#00FF88',
  });

  return `${baseUrl}?${params}`;
}
```

**Transak:**
```typescript
async function buildTransakUrl(walletAddress: string, chain: string): Promise<string> {
  // Current: network: 'solana', defaultCryptoCurrency: 'USDC'
  // Base:    network: 'base', defaultCryptoCurrency: 'USDC'
  const network = chain === 'base' ? 'base' : 'solana';

  // ... existing Transak two-step API flow ...
  // Just change the `network` parameter in the URL/API call
  // The rest of the logic (token caching, fallback URL) stays the same
}
```

**RESEARCH REQUIRED:**
- Verify Ramp supports `BASE_USDC` as a swapAsset. Check https://docs.ramp.network
- Verify MoonPay supports `usdc_base` as a currencyCode. Check https://docs.moonpay.com
- Verify Transak supports `base` as a network value. Check https://docs.transak.com
- These are the critical values to get right. If any provider doesn't support Base yet, the agent should add a comment and disable that provider for Base chain.

---

## Verification Checklist

1. **Send route handles `chain: 'base'` in body**: Returns EVM tx params for ETH and USDC
2. **Send route still works without chain**: Defaults to Solana (backward compat)
3. **ETH transfer**: Returns correct `to`, `value` (in hex wei), no `data`
4. **USDC transfer**: Returns correct `to` (USDC contract), `data` (encoded transfer call), `value: '0x0'`
5. **Address validation**: Rejects non-0x addresses for Base chain
6. **Self-send prevention**: Works with case-insensitive comparison for 0x addresses
7. **Onramp handles `?chain=base`**: Returns correct URLs with Base-specific asset codes
8. **Onramp backward compat**: Works without chain param (defaults to Solana)
9. **TypeScript compiles**: `cd apps/api && npx tsc --noEmit` — zero errors

## What to Commit
```
feat(api): add Base chain send and onramp support

- Add ETH native transfer and ERC-20 USDC transfer for Base chain
- Encode ERC-20 transfer(address,uint256) calldata for USDC sends
- Update onramp URLs for Ramp, MoonPay, Transak with Base network params
- Add chain parameter to send body and onramp query string
- Preserve existing Solana send and onramp logic unchanged
```
