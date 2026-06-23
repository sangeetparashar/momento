> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Phase 2 Agent Prompts — Backend (all 4 run in parallel after Phase 1 merge)

---

### AGENT 4 PROMPT: Base Balance Library + Route

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to create a new Base chain balance fetching library and update the balance API route to be chain-aware.

CONTEXT: The app currently fetches Solana wallet balances via Helius (apps/api/lib/helius.ts). You will create a parallel library for Base chain that fetches ETH balance and ERC-20 token balances using standard Ethereum JSON-RPC calls. The balance API route needs to accept a ?chain=base parameter and route to the correct library.

PREREQUISITES ALREADY MERGED:
- packages/shared/src/types.ts now has ChainType and updated WalletBalance with chain, nativeBalance, nativePriceUsd, nativeSymbol fields
- apps/api/lib/auth.ts now exports getWalletForChain(user, chain) and getChainParam(request)
- apps/api/prisma/schema.prisma User model now has baseWalletAddress and primaryChain fields
- PortfolioSnapshot model now has a chain field

STEP-BY-STEP:

1. Read these files first:
   - apps/api/lib/helius.ts (understand the pattern — your lib/base.ts follows the same shape)
   - apps/api/app/api/wallet/balance/route.ts (you will modify this)
   - apps/api/lib/auth.ts (for getWalletForChain, getChainParam imports)
   - apps/api/lib/redis.ts (for caching pattern — find cacheKeys object)
   - packages/shared/src/types.ts (for WalletBalance type)

2. CREATE apps/api/lib/base.ts with these exported functions:

   a) getEthBalance(walletAddress: string): Promise<number>
      - Use fetch() to call Base RPC (env var BASE_RPC_URL, default 'https://mainnet.base.org')
      - If ALCHEMY_API_KEY env var exists, use https://base-mainnet.g.alchemy.com/v2/{key} instead
      - Method: eth_getBalance with params [walletAddress, 'latest']
      - Response is hex string of wei — convert: Number(BigInt(result)) / 1e18
   
   b) getTokenBalances(walletAddress: string): Promise<TokenHolding[]>
      - Check known tokens using eth_call with balanceOf(address) selector 0x70a08231
      - Known tokens list:
        * USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals)
        * DAI: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb (18 decimals)
        * WETH: 0x4200000000000000000000000000000000000006 (18 decimals)
      - If ALCHEMY_API_KEY is set, also try alchemy_getTokenBalances for broader discovery
      - For USDC, hardcode priceUsd: 1.0 and valueUsd: amount
   
   c) fetchBaseWalletBalance(walletAddress: string): Promise<WalletBalance>
      - Call getEthBalance, getTokenBalances, and getEthPriceUsd (from CoinGecko) in parallel
      - CoinGecko URL: https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd
      - Return WalletBalance with: chain: 'base', nativeBalance: ethBalance, nativePriceUsd: ethPrice, nativeSymbol: 'ETH', solBalance: 0, solPriceUsd: 0, tokens, totalValueUsd, change24h: 0

   See docs/multi-chain/04-agent4-base-balance.md for the full implementation code.

3. MODIFY apps/api/app/api/wallet/balance/route.ts:
   
   a) Add imports at top:
      import { getChainParam, getWalletForChain } from '@/lib/auth';
      import { fetchBaseWalletBalance } from '@/lib/base';
   
   b) In the GET handler, after requireAuth:
      const chain = getChainParam(request);
      const walletAddress = getWalletForChain(user, chain);
   
   c) If !walletAddress, return empty balance with chain-specific fields
   
   d) Branch on chain:
      if (chain === 'base') → call fetchBaseWalletBalance(walletAddress)
      else → call existing fetchWalletBalance(walletAddress), then add chain-aware fields:
        balance.chain = 'solana';
        balance.nativeBalance = balance.solBalance;
        balance.nativePriceUsd = balance.solPriceUsd ?? 0;
        balance.nativeSymbol = 'SOL';
   
   e) Update the portfolio snapshot recording to include chain parameter.
      Find where prisma.portfolioSnapshot.create is called and add: chain,
   
   f) Keep ALL existing Solana logic intact — only ADD the chain branching around it.

4. MODIFY apps/api/lib/redis.ts:
   Find the cacheKeys object. If there's a walletBalance key, update it to include chain:
   walletBalance: (userId: string, chain: string = 'solana') => `wallet:balance:${chain}:${userId}`,
   
   Then update any call site in the balance route that uses this cache key to pass chain.

VERIFICATION:
- Run: cd apps/api && npx tsc --noEmit (zero errors)
- New file exists: apps/api/lib/base.ts
- GET /api/wallet/balance (no chain param) still returns Solana balance (backward compat)
- GET /api/wallet/balance?chain=base would return Base balance format
- No @solana/* imports in base.ts

COMMIT with message:
feat(api): add Base chain balance fetching library and chain-aware balance route
```

---

### AGENT 5 PROMPT: Base Swap Library + Route

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to create a Base chain swap library using the 0x API and update the swap route to be chain-aware.

CONTEXT: The app currently uses Jupiter (apps/api/lib/jupiter.ts) for Solana swaps. You will create a parallel library for Base chain using the 0x Swap API (https://0x.org/docs). The swap route needs a chain parameter.

PREREQUISITES ALREADY MERGED:
- packages/shared/src/types.ts has SwapQuote with a chain field
- apps/api/lib/auth.ts exports getWalletForChain() and getChainParam()
- packages/shared/src/constants.ts has CHAIN_CONFIG with base.usdcAddress

STEP-BY-STEP:

1. Read these files first:
   - apps/api/lib/jupiter.ts (understand the pattern)
   - apps/api/app/api/wallet/swap/route.ts (you will modify this — read the FULL file)
   - packages/shared/src/types.ts (SwapQuote interface)

2. RESEARCH: Verify the 0x API endpoint for Base chain.
   Use WebSearch or WebFetch to check: https://0x.org/docs/api
   Key things to confirm:
   - Base endpoint: https://base.api.0x.org/swap/v1/quote (or /swap/permit2/quote for newer version)
   - API key header name (likely "0x-api-key")
   - Native ETH representation (likely 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
   - Fee parameters: buyTokenPercentageFee, feeRecipient
   If you cannot access the docs, use the endpoint format shown above as a best guess with a TODO comment.

3. CREATE apps/api/lib/base-swap.ts with:

   a) getBaseSwapQuote(params): Promise<SwapQuote>
      - Call 0x API: GET {BASE_ZEROX_URL}/swap/v1/quote?sellToken=X&buyToken=Y&sellAmount=Z&slippagePercentage=P
      - Add 0x-api-key header if ZEROX_API_KEY env var exists
      - Add buyTokenPercentageFee and feeRecipient if BASE_FEE_WALLET env var exists
      - Map response to SwapQuote type with chain: 'base'
      - Store full 0x response in raw field (mobile client needs to, data, value, gas)
   
   b) buildBaseSwapTransaction(params): returns { to, data, value, gas, gasPrice, chainId: 8453, from, allowanceTarget, sellTokenAddress }
      - For EVM, the quote response IS the transaction — just extract the fields
      - Add requiresApproval flag: true if selling an ERC-20 (not native ETH)

   See docs/multi-chain/05-agent5-base-swap.md for full implementation code.

4. MODIFY apps/api/app/api/wallet/swap/route.ts:

   a) Add imports:
      import { getChainParam, getWalletForChain } from '@/lib/auth';
      import { getBaseSwapQuote, buildBaseSwapTransaction } from '@/lib/base-swap';

   b) UPDATE the GET handler:
      - Get chain with getChainParam(request)
      - If chain === 'base': extract sellToken, buyToken, sellAmount from query params (support both sellToken/buyToken AND inputMint/outputMint param names for compatibility)
      - Call getBaseSwapQuote and return result
      - Else: keep existing Solana/Jupiter logic UNCHANGED

   c) UPDATE the POST handler:
      - Read chain from body (body.chain || 'solana')
      - If chain === 'base': get wallet with getWalletForChain, call buildBaseSwapTransaction, return result with requiresApproval flag
      - Else: keep existing Solana/Jupiter logic UNCHANGED
      
   CRITICAL: Do NOT remove or alter ANY existing Solana swap code. Only add the Base chain branching around it.

VERIFICATION:
- Run: cd apps/api && npx tsc --noEmit (zero errors)
- New file exists: apps/api/lib/base-swap.ts
- GET /api/wallet/swap?inputMint=X&outputMint=Y&amount=Z (no chain) still works (Solana)
- POST /api/wallet/swap with body {quoteResponse: ...} (no chain) still works (Solana)
- No @solana/* imports in base-swap.ts

COMMIT with message:
feat(api): add Base chain swap library via 0x API and chain-aware swap route
```

---

### AGENT 6 PROMPT: Base Send + Onramp Routes

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to update the send and onramp API routes to support Base chain.

CONTEXT:
- Send route currently builds unsigned Solana transactions for SOL/USDC transfers
- Onramp route generates fiat purchase URLs for Ramp, MoonPay, Transak configured for Solana
- For Base chain, send returns EVM transaction parameters instead of serialized transactions
- For Base chain, onramp URLs need different network/asset codes

PREREQUISITES ALREADY MERGED:
- apps/api/lib/auth.ts exports getWalletForChain() and getChainParam()
- packages/shared/src/constants.ts has CHAIN_CONFIG.base.usdcAddress ('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') and usdcDecimals (6)

STEP-BY-STEP:

1. Read these files FULLY:
   - apps/api/app/api/wallet/send/route.ts (entire file — understand all existing Solana logic)
   - apps/api/app/api/wallet/onramp/route.ts (entire file — understand all provider URL builders)
   - apps/api/lib/auth.ts (for imports)

2. MODIFY apps/api/app/api/wallet/send/route.ts:

   a) Add imports:
      import { getWalletForChain } from '@/lib/auth';
      import { CHAIN_CONFIG } from '@momento/shared';

   b) In the POST handler, extract chain from body: const { recipientAddress, amount, token, chain = 'solana' } = body;

   c) Update token validation to also accept 'ETH': if (!['SOL', 'USDC', 'ETH'].includes(token))

   d) Add Base chain branch BEFORE the existing Solana logic:
      if (chain === 'base') { return handleBaseSend(user, recipientAddress, amount, token); }

   e) Create handleBaseSend function (can be in the same file or above the handler):
      - Get wallet: getWalletForChain(user, 'base') — return 400 if null
      - Validate address: /^0x[a-fA-F0-9]{40}$/.test(recipientAddress)
      - Self-send check: recipientAddress.toLowerCase() === walletAddress.toLowerCase()
      - For ETH: return { chain: 'base', transactionType: 'native', to: recipientAddress, value: '0x' + BigInt(Math.floor(amount * 1e18)).toString(16), from: walletAddress, chainId: 8453 }
      - For USDC: encode transfer(address,uint256) — function selector 0xa9059cbb, pad recipient to 64 hex chars, pad amount (with 6 decimals) to 64 hex chars. Return { chain: 'base', transactionType: 'erc20', to: CHAIN_CONFIG.base.usdcAddress, value: '0x0', data: encodedCalldata, from: walletAddress, chainId: 8453 }

   f) Keep ALL existing Solana send logic in the else branch — do NOT modify it.

3. MODIFY apps/api/app/api/wallet/onramp/route.ts:

   a) Add import: import { getWalletForChain } from '@/lib/auth';

   b) In the GET handler, extract chain: const chain = url.searchParams.get('chain') || 'solana';

   c) Resolve wallet address using chain: const walletAddress = getWalletForChain(user, chain);

   d) Update EACH provider URL builder to accept a chain parameter:

      For Ramp: change swapAsset from 'SOLANA_USDC' to chain === 'base' ? 'BASE_USDC' : 'SOLANA_USDC'
      
      For MoonPay: change currencyCode from 'usdc_sol' to chain === 'base' ? 'usdc_base' : 'usdc_sol'
      
      For Transak: change network from 'solana' to chain === 'base' ? 'base' : 'solana'
      
      IMPORTANT: Read the actual current code to find where these values are set. The variable names and locations may differ from what I described. Search for 'SOLANA_USDC', 'usdc_sol', 'solana' in the file to find the exact lines.

   e) Add chain to the response: data: { url, provider, coin: 'USDC', walletAddress, chain }

   f) RESEARCH (optional): If you can access web, verify these provider asset codes are correct:
      - Ramp: BASE_USDC
      - MoonPay: usdc_base  
      - Transak: network 'base'
      If you cannot verify, add TODO comments noting the codes need verification.

VERIFICATION:
- Run: cd apps/api && npx tsc --noEmit (zero errors)
- POST /api/wallet/send with {recipientAddress, amount, token: 'SOL'} (no chain) still works
- POST /api/wallet/send with {chain: 'base', recipientAddress: '0x...', amount: 1, token: 'ETH'} returns EVM tx params
- GET /api/wallet/onramp?provider=transak (no chain) still returns Solana URL
- GET /api/wallet/onramp?provider=transak&chain=base returns Base URL

COMMIT with message:
feat(api): add Base chain send and onramp support
```

---

### AGENT 7 PROMPT: History & Snapshots Routes

```
You are implementing multi-chain support (Base + Solana) for the Momento app. Your task is to update the price history and portfolio snapshots API routes to be chain-aware.

CONTEXT:
- History route fetches SOL price from CoinGecko. For Base chain, we need ETH price instead.
- Snapshots route returns portfolio history. Now has a chain field in the database.
- Portfolio snapshot recording (in the balance route) also needs the chain field.

PREREQUISITES ALREADY MERGED:
- apps/api/lib/auth.ts exports getChainParam(request)
- PortfolioSnapshot model has chain field with default 'solana'
- WalletBalance type has nativeBalance, nativePriceUsd fields

STEP-BY-STEP:

1. Read these files FULLY:
   - apps/api/app/api/wallet/history/route.ts
   - apps/api/app/api/wallet/snapshots/route.ts
   - apps/api/lib/redis.ts (find cacheKeys object)
   - apps/api/app/api/wallet/balance/route.ts (find where PortfolioSnapshot is created — may have been updated by Agent 4)

2. MODIFY apps/api/app/api/wallet/history/route.ts:

   a) Add import: import { getChainParam } from '@/lib/auth';
   
   b) In GET handler, get chain: const chain = getChainParam(request);
   
   c) Determine CoinGecko coin ID: const coinId = chain === 'base' ? 'ethereum' : 'solana';
   
   d) Use coinId in the CoinGecko URL: find the existing fetch call that includes 'solana' in the URL and replace the hardcoded 'solana' with the coinId variable.
   
   e) Update cache key to include coinId (so Solana and Base histories are cached separately)

3. MODIFY apps/api/app/api/wallet/snapshots/route.ts:

   a) Add import: import { getChainParam } from '@/lib/auth';
   
   b) In GET handler, get chain: const chain = getChainParam(request);
   
   c) Add chain to the Prisma where clause: where: { userId: user.id, chain, createdAt: { gte: since } }
   
   d) In the response mapping, add native field to PortfolioPoint: native: s.solValueUsd (the solValueUsd field holds native token value regardless of chain)

4. CHECK SNAPSHOT RECORDING in balance route:
   Read apps/api/app/api/wallet/balance/route.ts and find where prisma.portfolioSnapshot.create is called.
   If the chain field is NOT already included in the create data (Agent 4 may have already added it), add it:
   chain: chain, // where chain comes from getChainParam(request)
   
   If Agent 4 already handled this, skip this step.

5. MODIFY apps/api/lib/redis.ts:
   Add or update cache keys:
   priceHistory: (coinId: string, range: string) => `price:history:${coinId}:${range}`,

VERIFICATION:
- Run: cd apps/api && npx tsc --noEmit (zero errors)
- GET /api/wallet/history (no chain) still returns SOL price
- GET /api/wallet/history?chain=base returns ETH price
- GET /api/wallet/snapshots?chain=base filters by chain

COMMIT with message:
feat(api): add chain-aware price history and portfolio snapshots
```

---
