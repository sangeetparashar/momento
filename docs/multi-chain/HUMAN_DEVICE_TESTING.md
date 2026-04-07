# Human Device Testing — Multi-Chain (Base + Solana)

This is the verification checklist for end-to-end testing of the multi-chain
implementation **on real devices and against the live API**, covering everything
the orchestrator could not validate from the IDE.

**Owner:** human tester
**Estimated time:** 90–120 minutes for the full matrix on a single device, plus
~30 minutes per additional device.
**Prerequisites:** test ETH on Base mainnet (~$5) for swap/send testing, a Privy
test account with Google OAuth, optionally a Phantom test wallet for the
Solana-only path.

---

## Phase A — Backend deploy & migration

### A1. Run the database migration

The Prisma migration `20260404000000_add_base_wallet_support` exists on disk
but **has not been applied** to any database yet. Without it, every
`/api/wallet/balance?chain=base` request will 500 because Prisma will try to
read columns that don't exist.

```bash
# Against staging
cd apps/api
DATABASE_URL="postgres://...staging..." \
DIRECT_URL="postgres://...staging..." \
npx prisma migrate deploy

# Against prod (only after staging passes)
DATABASE_URL="postgres://...prod..." \
DIRECT_URL="postgres://...prod..." \
npx prisma migrate deploy
```

Verify after migration:

```sql
-- All existing users should have:
--   baseWalletAddress = NULL
--   primaryChain = 'solana'
SELECT id, "walletAddress", "baseWalletAddress", "primaryChain"
FROM users
LIMIT 10;

-- All existing portfolio snapshots should have chain='solana'
SELECT id, "userId", chain, "totalValueUsd", "createdAt"
FROM portfolio_snapshots
ORDER BY "createdAt" DESC
LIMIT 10;
```

- [ ] Staging migration applied without errors
- [ ] Sample query confirms existing rows have NULL Base wallet and `solana` defaults
- [ ] Production migration applied without errors

### A2. Configure Base env vars on the API host

Add to your Vercel project (or wherever API is deployed):

| Variable | Value | Required? |
|---|---|---|
| `BASE_RPC_URL` | `https://mainnet.base.org` (default) or your own RPC | Optional |
| `ALCHEMY_API_KEY` | Your Alchemy key | Optional — enables broader token discovery |
| `BASE_FEE_WALLET` | A 0x address you control | Optional — turns on platform fee for Base swaps |
| `KYBER_CLIENT_ID` | `momento` (default) | Optional |

- [ ] Required Base env vars set on staging API
- [ ] Required Base env vars set on production API

### A3. Smoke-test API endpoints with curl

Get a Privy access token from a logged-in test user (use the AuthBridge debug
log in dev, or copy from React DevTools / a request inspector). Then:

```bash
TOKEN="..."
API="https://momento-api-ten.vercel.app/api"

# 1. Solana balance (no chain param) — must work as before
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/balance" | jq

# 2. Base balance — should return chain:'base', nativeBalance:0 (or your test ETH)
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/balance?chain=base" | jq

# 3. Solana swap quote
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/wallet/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000" | jq

# 4. Base swap quote (0.001 ETH → USDC)
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/wallet/swap?chain=base&sellToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&buyToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&sellAmount=1000000000000000" | jq

# 5. SOL price history (7d)
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/history?range=7D" | jq

# 6. ETH price history (7d)
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/history?chain=base&range=7D" | jq

# 7. Solana onramp URL
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/onramp?provider=transak" | jq

# 8. Base onramp URL
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/onramp?provider=transak&chain=base" | jq

# 9. Solana snapshots
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/snapshots?range=1M" | jq

# 10. Base snapshots (will be empty until A4 populates them)
curl -s -H "Authorization: Bearer $TOKEN" "$API/wallet/snapshots?chain=base&range=1M" | jq
```

Expected results:

- [ ] **#1** Returns Solana balance with `chain:'solana'` and the new
  `nativeBalance`/`nativePriceUsd`/`nativeSymbol` fields populated
- [ ] **#2** Returns `chain:'base'`, `nativeSymbol:'ETH'`, even with 0 balance
- [ ] **#3** Returns Jupiter quote with `platformFee` if `MOMENTO_FEE_WALLET` is
  configured
- [ ] **#4** Returns KyberSwap quote with `chain:'base'` and `raw.aggregator =
  'kyberswap'`. Inspect the `raw.routeSummary` — it should NOT be 0x v1 shape.
- [ ] **#5** Returns SOL price array (negative numbers OK)
- [ ] **#6** Returns ETH price array — note it should be visibly different from
  #5 (different price range)
- [ ] **#7** Returns Solana USDC onramp URL with `chain:'solana'`
- [ ] **#8** Returns Base USDC onramp URL with `chain:'base'` — verify the URL
  contains `BASE_USDC` (Ramp) / `usdc_base` (MoonPay) / `network=base` (Transak)
  depending on provider
- [ ] **#9** Returns Solana snapshots
- [ ] **#10** Returns empty array initially

### A4. Trigger a Base portfolio snapshot

After step #2 above, the balance route's fire-and-forget snapshot writer should
have created a row in `portfolio_snapshots` with `chain='base'`. Verify:

```sql
SELECT id, "userId", chain, "totalValueUsd", "solBalance", "solValueUsd", "createdAt"
FROM portfolio_snapshots
WHERE chain = 'base'
ORDER BY "createdAt" DESC
LIMIT 5;
```

- [ ] At least one row with `chain='base'` exists
- [ ] **Known cosmetic**: `solBalance`/`solValueUsd` columns hold the ETH
  amount (column rename is a deferred follow-up). Confirm the value matches
  your test wallet's ETH balance.

---

## Phase B — Mobile bring-up (single OAuth user)

Build and install a fresh dev build on Android (or use Expo Go for the
non-Privy guest mode subset).

### B1. Cold-start the app

- [ ] App boots without crashing
- [ ] No red error screens in dev mode
- [ ] Login screen displays MomentoLogo and the "Connect Base Wallet" button
  with **#0052FF** (Base blue) styling

### B2. OAuth login (Google) — both wallets created

- [ ] Tap Google login → flow completes successfully
- [ ] Within ~3–5 seconds, both Solana and Ethereum embedded wallets are created
  by Privy (you can verify in the Privy dashboard for the user)
- [ ] After login, the app routes to the home tab without errors
- [ ] In the React Native debug logs, you should see Solana wallet creation
  followed by Ethereum wallet creation (~2s stagger)

### B3. Wallet screen — initial Solana view

Open the wallet tab.

- [ ] Wallet card shows the Solana address
- [ ] **ChainSwitcher** shows "Solana" with the purple `#9945FF` dot
- [ ] Network badge shows the SOLANA_NETWORK env value (`mainnet-beta` for prod)
- [ ] "View on Solscan" link works
- [ ] Native asset card shows SOL with the `◎` icon
- [ ] Total balance displays correctly with `(24h)` percentage from Helius
- [ ] Recent transactions list loads from `momento_recent_txs:<userId>:solana`

### B4. Switch to Base via the ChainSwitcher

- [ ] Tap the ChainSwitcher → Modal opens with "SELECT NETWORK"
- [ ] Both Solana (active, with checkmark) and Base options visible
- [ ] Tap Base → Modal closes
- [ ] Wallet card now shows the Ethereum 0x address
- [ ] Network badge updates to BASE_NETWORK (`mainnet` for prod)
- [ ] "View on BaseScan" link works and opens basescan.org
- [ ] Native asset card shows ETH with the `Ξ` icon and **#0052FF** color
- [ ] Total balance shows ETH balance × ETH price + tokens
- [ ] **24h change** displays a non-zero value (this is the new Phase 4 fix)
- [ ] Recent transactions list is empty (no Base txs yet) and reads from a
  different storage key than Solana

### B5. Persistence across restart

- [ ] Force-quit the app while on Base view
- [ ] Cold-start → wallet screen still shows Base (chain selection persisted to
  AsyncStorage `momento_selected_chain`)
- [ ] Switch back to Solana → quit → cold-start → still Solana

---

## Phase C — Base on-chain transactions

You'll need ~$5 in test ETH on Base mainnet. If you don't have any, complete
the Fund Wallet flow first (Phase D2).

### C1. Receive ETH (no app action — verify balance polling)

- [ ] Send some ETH from another wallet (or buy via onramp) to the app's Base
  address
- [ ] Within 30 seconds the wallet screen's ETH balance updates
- [ ] Total balance USD updates to match
- [ ] No red error screens or stale "0 ETH" display

### C2. Send ETH

- [ ] Tap SEND on the wallet screen
- [ ] Token toggle defaults to **ETH** (not SOL — this is the chain-aware reset)
- [ ] Try entering an invalid Solana base58 address → validation error
- [ ] Try entering an invalid 0x address → validation error
- [ ] Try entering your own wallet address → "self-send" error
- [ ] Enter a valid 0x recipient + 0.0001 ETH
- [ ] Tap Send → Privy signing UI appears
- [ ] Approve → tx submitted → waiting for confirmation (polling
  `eth_getTransactionReceipt`)
- [ ] On confirmation, success screen shows tx hash
- [ ] **Recent Transactions** list on the wallet screen shows the new send
  (this verifies the storage key fix)
- [ ] Tap the tx in the list → opens basescan.org/tx/...

### C3. Send USDC (if you have any test USDC on Base)

- [ ] Toggle to USDC in SendModal
- [ ] Send 0.01 USDC to a known address
- [ ] Privy signs the ERC-20 transfer calldata
- [ ] Tx confirms, balance updates
- [ ] Recent Transactions shows the send

### C4. Swap ETH → USDC

- [ ] Tap SWAP on the wallet screen
- [ ] Token list shows ETH (input) and USDC (output) — NOT SOL
- [ ] Enter 0.001 ETH
- [ ] Quote loads from KyberSwap
- [ ] Output amount shows expected USDC
- [ ] Header subtitle says "Powered by KyberSwap" (this is a Phase 3 cue)
- [ ] Tap Swap → since ETH is native, **no approval** step (requiresApproval=false)
- [ ] Privy signs the swap → tx submits → confirms
- [ ] Success screen shows tx hash
- [ ] Wallet balance fast-polls and updates within 10 seconds
- [ ] Recent Transactions shows the swap

### C5. Swap USDC → ETH (the approve flow)

- [ ] In SwapModal, swap input/output so USDC is the input
- [ ] Enter 0.5 USDC
- [ ] Quote loads
- [ ] Tap Swap
- [ ] **First**, Privy signing prompt for the **approve(allowanceTarget, max_uint256)**
  ERC-20 transaction
- [ ] After the approve confirms (~5–10s), Privy prompts again for the **swap** tx
- [ ] After the swap confirms, success screen
- [ ] Verify on basescan: two transactions from your wallet — first is to the
  USDC contract (`approve` call), second is to the KyberSwap router

### C6. Failure modes (negative tests)

- [ ] Try to swap more ETH than you have → balance check rejects
- [ ] Disconnect from internet, try to swap → network error displayed cleanly
- [ ] Reconnect, try to swap an amount below minimum → validation error
- [ ] Switch chains mid-quote → modal resets cleanly

---

## Phase D — Onramps

### D1. Solana onramp (regression check)

- [ ] Open FundWalletModal on Solana view
- [ ] Pick Ramp / MoonPay / Transak — each one loads a WebView
- [ ] Each provider URL points to **Solana USDC**
- [ ] Wallet address shown matches your Solana address
- [ ] Cancel out (don't actually buy)

### D2. Base onramp

- [ ] Switch to Base view
- [ ] Open FundWalletModal
- [ ] Address displayed in "On-chain transfer" section is the **ETH 0x address**,
  not the Solana address
- [ ] Network warning says "Base network" (not "Solana network")
- [ ] Pick each provider:
  - **Ramp**: URL contains `swapAsset=BASE_USDC`
  - **MoonPay**: URL contains `currencyCode=usdc_base`
  - **Transak**: URL contains `network=base`
- [ ] Cancel out, or optionally complete a small purchase to validate end-to-end

### D3. On-chain transfer instructions

- [ ] In FundWalletModal → On-chain Transfer section on Base, instructions
  reference Coinbase Wallet / MetaMask / Base network
- [ ] Copy address → confirm it matches the displayed 0x address
- [ ] Send a tiny amount from MetaMask → balance updates within 30s

---

## Phase E — Multi-account & edge cases

### E1. Logout / login same account

- [ ] Logout from the wallet screen
- [ ] Login again with the same Google account
- [ ] Wallet addresses are the same as before (Privy reuses)
- [ ] Chain selection persists (was on Base before logout? still on Base after)
- [ ] Recent transactions list shows the same items (storage key is per-userId)

### E2. Logout / login DIFFERENT account

- [ ] Logout
- [ ] Login with a different Google account
- [ ] **The wallet balance should NOT bleed through from the previous account**
  (this validates the `userId` in the React Query key fix)
- [ ] Recent Transactions list is empty (different userId namespace)
- [ ] Chain selection from the previous user does NOT carry over (or does — the
  chain key is global, not per-user; document expected behavior)

### E3. Phantom-only login (Solana single-chain)

- [ ] On a fresh install, login via Phantom deeplink (no OAuth)
- [ ] Only the Solana wallet exists; no embedded ETH wallet
- [ ] On the wallet screen, **ChainSwitcher shows single-chain mode**: just
  "Solana" label with no chevron, not tappable
- [ ] Cannot switch to Base via UI

### E4. Coming Soon path (Base external wallet)

- [ ] On the login screen, tap "Connect Base Wallet"
- [ ] "Coming Soon" alert appears
- [ ] No crash
- [ ] (When WalletConnect ships, this will be replaced with a real flow)

### E5. Expo Go guest mode

- [ ] Open the project in Expo Go
- [ ] App loads in guest mode (Privy not available)
- [ ] Wallet screen shows DUMMY_WALLET_BALANCE (Solana data)
- [ ] ChainSwitcher shows single-chain Solana mode
- [ ] No crashes from undefined `ethWalletAddress`
- [ ] All modals open without errors

---

## Phase F — Backwards compatibility (existing Solana users)

The most important regression check: **anyone using the app pre-multi-chain
must see zero behavior change unless they explicitly switch to Base.**

### F1. Existing user: balance API

- [ ] Pick an existing Solana user from the database
- [ ] Their `walletAddress` is unchanged
- [ ] Their `baseWalletAddress` is `NULL`
- [ ] Their `primaryChain` is `'solana'`
- [ ] On the mobile app, their wallet screen renders identically to the
  pre-multi-chain version: Solana label, SOL balance, Solscan links, USDC card,
  recent txs

### F2. Existing user: portfolio snapshots

- [ ] Pre-existing rows in `portfolio_snapshots` all have `chain='solana'`
  (defaulted by the migration)
- [ ] The Solana snapshots query (`/wallet/snapshots`) returns the same rows
  as before
- [ ] The wallet screen's price chart still renders

### F3. Existing user: swaps & sends

- [ ] Existing user opens SwapModal — token list is SOL/USDC (no ETH)
- [ ] Existing user opens SendModal — token toggle is SOL/USDC (no ETH)
- [ ] Send a SOL test tx → still works via Privy + Solana RPC + Jupiter (no
  Base code path touched)
- [ ] Swap a Solana token → still works via Jupiter (no KyberSwap code path)
- [ ] FundWalletModal Solana flows return Solana onramp URLs

### F4. API regressions

For each route, hit it without `chain` param and confirm the response is
identical to pre-multi-chain (modulo the new `chain`/`nativeBalance`/etc.
fields which are additive):

- [ ] `GET /wallet/balance` (no chain) → solana
- [ ] `GET /wallet/swap?inputMint=...` (no chain) → Jupiter
- [ ] `POST /wallet/swap` body without `chain` → Jupiter
- [ ] `POST /wallet/send` body without `chain` → Solana
- [ ] `GET /wallet/onramp?provider=...` (no chain) → Solana USDC
- [ ] `GET /wallet/history?range=...` (no chain) → SOL price
- [ ] `GET /wallet/snapshots?range=...` (no chain) → Solana snapshots only

---

## Phase G — Performance & monitoring

### G1. Cache hit rates

After running the test matrix for a while, check Upstash Redis:

- [ ] `wallet:balance:solana:<userId>` keys exist with 30s TTL
- [ ] `wallet:balance:base:<userId>` keys exist with 30s TTL
- [ ] `price:eth-usd:full` key exists with 60s TTL
- [ ] `price:history:ethereum:<days>` key exists
- [ ] `price:history:solana:<days>` key exists

### G2. Rate limits

- [ ] No CoinGecko 429 errors in API logs after 10+ minutes of testing
  (the 60s ETH price cache should prevent this)
- [ ] No KyberSwap 429s — if you see them, set `KYBER_CLIENT_ID` to a
  project-specific value
- [ ] Helius RPC quota usage is normal

### G3. Heap / memory

- [ ] On Android, switch chains 20+ times rapidly — no OOM, no leaks
- [ ] Open and close all 3 modals 10+ times — no zombie listeners

---

## Phase H — Security spot-checks

### H1. Auth boundary

- [ ] `getChainParam` only accepts `'base'` literal — try `?chain=BASE` →
  returns solana (default)
- [ ] Try `?chain=foo` → returns solana
- [ ] Try `?chain=` → returns solana

### H2. Wallet binding

- [ ] **CRITICAL**: try fetching a Base swap quote, then sending the
  `quoteResponse` from a different account's session → server should reject
  with "Quote was fetched for a different wallet" (this is the Phase 2 cleanup
  fix from Agent A)

### H3. Address validation

- [ ] Send to `0x` (too short) → rejected
- [ ] Send to `0x123` (too short) → rejected
- [ ] Send to `0xZZZZ...` (invalid hex) → rejected
- [ ] Send to a valid 0x but lowercase (no checksum) → accepted
- [ ] Send to a valid 0x with mixed case (EIP-55 checksum) → accepted

### H4. Precision

- [ ] Send 0.0001 ETH → calldata `value` should be `0x5af3107a4000` (1e14)
- [ ] Send 0.5 ETH → calldata `value` should be `0x6f05b59d3b20000` (5e17)
- [ ] These verify the new `parseUnits` helper from the Phase 2 cleanup

---

## Sign-off

| Phase | Tester | Date | Notes |
|---|---|---|---|
| A — Backend deploy & migration | | | |
| B — Mobile bring-up | | | |
| C — Base on-chain transactions | | | |
| D — Onramps | | | |
| E — Multi-account & edge cases | | | |
| F — Backwards compatibility | | | |
| G — Performance & monitoring | | | |
| H — Security spot-checks | | | |

**Sign-off criteria for shipping to production:**
- All Phase A, B, F, and H boxes checked
- Phase C: at least C1, C2, C4, C5 (the swap approve flow is the highest-risk path)
- Phase D: D2 must be checked
- Phase E: E1, E2, E5 must be checked

Open issues found during testing should be filed against the multi-chain
follow-up list in `docs/multi-chain/11-phase4-integration.md` Section "Recommended Follow-ups".
