# Phase 4: Integration & Final Verification

## Mission
After all 10 agents have been merged, the orchestrator performs final integration: dependency cleanup, end-to-end verification, and any cross-cutting fixes.

## This Phase is Performed by the Orchestrator (Not an Isolated Agent)

---

## Step 1: Dependency Audit

### API Package (`apps/api/package.json`)
No new dependencies required. The `lib/base.ts` and `lib/base-swap.ts` use only:
- Native `fetch` API (available in Next.js)
- `BigInt` (native JS)
- Types from `@momento/shared`

### Mobile Package (`apps/mobile/package.json`)
No new dependencies required IF Privy's Expo SDK already supports Ethereum embedded wallets (which it should). Verify:
```bash
cd apps/mobile
grep -r "useEmbeddedEthereumWallet\|useEmbeddedEvmWallet" node_modules/@privy-io/expo/
```

If Privy doesn't support ETH wallets in the current version, upgrade:
```bash
cd apps/mobile
pnpm update @privy-io/expo@latest
```

### Dependencies to NOT Add
- Do NOT add `ethers.js` or `viem` — we're using raw RPC calls + Privy's provider
- Do NOT add `@uniswap/sdk` — we're using 0x API
- Do NOT add `@walletconnect/react-native-compat` yet — defer to v2

### Dependencies to Consider Removing (Future)
- `@solana-mobile/mobile-wallet-adapter-protocol` — still needed for MWA login
- `@solana/web3.js` — still needed for Solana send/swap signing
- None should be removed in this phase — both chains coexist

---

## Step 2: TypeScript Compilation Check

Run across all packages:
```bash
cd /path/to/momento

# Shared types
cd packages/shared && npx tsc --noEmit && echo "shared: OK"

# API
cd ../apps/api && npx tsc --noEmit && echo "api: OK"

# Mobile
cd ../apps/mobile && npx tsc --noEmit && echo "mobile: OK"
```

Fix any type errors that arise from the merge of all agents.

### Common Merge Issues to Watch For:
1. **Duplicate imports**: Two agents may both add `import { getChainParam } from '@/lib/auth'` — deduplicate
2. **Conflicting interface updates**: If Agent 1 and Agent 2 both modify the same interface, resolve
3. **Missing re-exports**: Ensure `packages/shared/src/index.ts` exports all new types
4. **Barrel export conflicts**: If agents add to `components/features/index.ts`, merge carefully

---

## Step 3: End-to-End Flow Verification

### Test Matrix

| Flow | Solana | Base | Status |
|------|--------|------|--------|
| OAuth login → both wallets created | ✓ | ✓ | |
| Phantom login → Solana only | ✓ | N/A | |
| WalletConnect login → Base only | N/A | ✓ | |
| Balance fetch (empty wallet) | ✓ | ✓ | |
| Balance fetch (with tokens) | ✓ | ✓ | |
| Swap quote (native→USDC) | ✓ | ✓ | |
| Swap execute | ✓ | ✓ | |
| Send native token | ✓ | ✓ | |
| Send USDC | ✓ | ✓ | |
| Onramp URL generation | ✓ | ✓ | |
| Price history | ✓ | ✓ | |
| Portfolio snapshots | ✓ | ✓ | |
| Chain switcher (dropdown) | ✓ | ✓ | |
| Chain persists across restart | ✓ | ✓ | |
| Explorer links correct | ✓ | ✓ | |

### Manual Testing Script

```bash
# 1. Start API server
cd apps/api && pnpm dev

# 2. Test balance endpoint (Solana)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/balance"

# 3. Test balance endpoint (Base)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/balance?chain=base"

# 4. Test swap quote (Solana)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000"

# 5. Test swap quote (Base)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/swap?chain=base&sellToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&buyToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&sellAmount=1000000000000000"

# 6. Test history (Solana - SOL price)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/history?range=7D"

# 7. Test history (Base - ETH price)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/history?chain=base&range=7D"

# 8. Test onramp (Base)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/wallet/onramp?provider=transak&chain=base"
```

---

## Step 4: Database Migration

Ensure the migration from Agent 2 applies cleanly:

```bash
cd apps/api
npx prisma migrate deploy
# or for dev:
npx prisma migrate dev
```

Verify existing users are unaffected:
```sql
-- All existing users should have:
-- baseWalletAddress = NULL
-- primaryChain = 'solana'
SELECT id, walletAddress, baseWalletAddress, primaryChain
FROM users
LIMIT 10;
```

---

## Step 5: Environment Variable Checklist

### Required for Base Chain to Work
| Variable | Where | Required? | Notes |
|----------|-------|-----------|-------|
| `BASE_RPC_URL` | API .env | Optional | Defaults to public Base RPC |
| `ALCHEMY_API_KEY` | API .env | Optional | Enables broader token discovery |
| `BASE_FEE_WALLET` | API .env | Optional | 0x address for platform fees (KyberSwap) |
| `KYBER_CLIENT_ID` | API .env | Optional | Friendlier rate limits, defaults to "momento" |
| `EXPO_PUBLIC_BASE_RPC_URL` | Mobile .env | Optional | Defaults to public Base RPC |
| `EXPO_PUBLIC_BASE_CHAIN_ID` | Mobile .env | Optional | Defaults to 8453 |

> **Note:** The original plan called for `ZEROX_API_KEY`. 0x sunset their free Swap API v1 in April 2025, so we replaced 0x with **KyberSwap Aggregator** (free, no API key required, aggregates DEXes on Base). See `apps/api/lib/base-swap.ts`.

### Existing Variables (Unchanged)
All Solana-related variables remain unchanged and required for Solana chain to function.

---

## Step 6: Known Limitations & Future Work

### Limitations in This Implementation
1. **No WalletConnect on mobile yet**: External Base wallet login button in `login.tsx` shows a "Coming Soon" alert. SIWE wiring is in place in `useAuth.loginWithEthWallet`; just needs an external EVM connector (WalletConnect v2 or Coinbase Wallet SDK) to provide the address + sign function.
2. **Limited Base token discovery**: Without `ALCHEMY_API_KEY`, only known tokens (USDC, DAI, WETH) are priced. Other tokens discovered via the optional Alchemy path appear in the list but have no `priceUsd`.
3. **24h change tracking**: ETH price 24h change is now surfaced as the wallet screen's "(24h)" indicator on Base via CoinGecko's `usd_24h_change`. (Previous version returned 0.) Solana still inherits its 24h change behavior from Helius.
4. **Single swap provider (KyberSwap)**: No aggregation fallback for Base swaps. KyberSwap rate limits are undocumented; sending `X-Client-Id: momento` for friendlier limits.
5. **Portfolio history**: Price chart shows ETH price (not portfolio value) for Base chain until sufficient snapshots accumulate.
6. **Fee collection on Base**: Configured via `BASE_FEE_WALLET` env var, threaded through KyberSwap's `chargeFeeBy=currency_out` + `feeAmount` (bps from `MOMENTO_PLATFORM_FEE_BPS`, default 4%) + `feeReceiver`. Gracefully no-ops if `BASE_FEE_WALLET` is unset.
7. **`solBalance`/`solValueUsd` columns hold ETH on Base snapshots**: cosmetic — both the `native` and `sol` fields in the snapshots response come from the same column. A future migration should rename these columns to `nativeBalance`/`nativeValueUsd`.
8. **KyberSwap requires separate ERC-20 approval** for non-native sells: mobile client correctly handles this via `requiresApproval` + `allowanceTarget` flow in `useSwap.executeSwap`.

### Recommended Follow-ups
1. **WalletConnect v2**: Full WalletConnect integration so the "Connect Base Wallet" button in `login.tsx` can actually connect a MetaMask / Coinbase Wallet. Wire its address+sign function into `auth.loginWithEthWallet`.
2. **Add viem**: Replace raw `eth_call` / `eth_getBalance` / `parseUnits` / `formatUnits` helpers with viem for type safety and better error handling.
3. **Schema rename migration**: `solBalance` → `nativeBalance`, `solValueUsd` → `nativeValueUsd` in `PortfolioSnapshot`. Keeps DB column names honest on Base.
4. **Token metadata API**: Use Alchemy or Moralis for automatic token logo/name/price resolution on Base.
5. **Gas estimation**: Show estimated gas cost in USD before Base transactions (call `eth_estimateGas` + `eth_gasPrice`).
6. **Multi-chain portfolio chart**: Combine Solana + Base portfolio values in a single chart.
7. **Bridge integration**: Allow users to bridge assets between Solana and Base (e.g., via Wormhole or deBridge).
8. **Initial `availableChains` flash**: ChainProvider briefly shows single Solana state on first mount until `useAuth`'s effect runs (~2s). Consider initializing from a fast synchronous check.
