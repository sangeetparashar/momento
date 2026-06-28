# D-trade-ui — Phase 3B Mobile: Token DETAIL + BUY/SELL TRADE Screen

> **Status:** Implementation-ready design. Owner: P3B-trade (mobile).
> **Replaces** the hardcoded placeholder TOKEN tab (`$0.004` / "Trading Coming Soon") in
> `apps/mobile/app/creator/[id].tsx` and the `ComingSoonModal` wired to BUY/SELL.
> **Backend contract:** `docs/solana-migration/design/phase3/CONTRACTS-P3A.md` §b.2, §d.2, §d.3, §d.4.
> **Design system:** repo `CLAUDE.md`, `docs/design/DESIGN_REFERENCE.md`, `docs/design/screens/creator-token.png`.
> Pure-black `#000000`, surface `#1A1A1A`, accent `#00FF88`, text `#FFFFFF`/`#888888`/`#555555`,
> border `#2A2A2A`. ALL-CAPS MONOSPACED (Space Mono), wide tracking. Verified = 8px green dot.

---

## 0. What exists today (must change)

`apps/mobile/app/creator/[id].tsx` — `renderTokenTab()` (lines ~304–367) renders:
- Hardcoded `tokenData = { price: '0.004', change24h: '17%', marketCap: '10.6K' }`
- Sample `chartData` array
- `<BuySellPills onBuy={() => setShowComingSoon(true)} onSell={...} />`
- `<ComingSoonModal title="Trading Coming Soon!" />`

`apps/mobile/app/market.tsx` and `app/portfolio.tsx` also show the `0.004` placeholder string — those
are out of scope for THIS task (flagged to other designers, §10) but the **shared hook + types** here
should be the source those screens migrate to.

This task: replace the placeholder TOKEN tab with a real, data-driven token panel, add a dedicated
full-screen **Trade route**, and ship the **data layer** (API methods, hooks, types, client-sign helper).

---

## 1. File manifest (CREATE unless noted)

### 1.1 Types (shared, consumed by all P3B mobile tasks)
| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/mobile/src/types/token.ts` | CREATE | Mobile-side mirrors of P3A wire shapes: `TokenDetail`, `TradeQuote`, `TradeBuildResponse`, `TradeSubmitResult`, `TradeSide`, `TradeVenue`, `TokenTradesSummary`, `RecentTrade`, `TokenFeesSummary`. Re-export from `packages/shared` where present; keep narrow local copies for fields the API returns but shared lacks (see §2). |

### 1.2 Hooks
| File | Responsibility |
|---|---|
| `apps/mobile/src/hooks/useTokenDetail.ts` | `useQuery(['token', mint])` → `GET /tokens/[mint]`. 15s `staleTime`, `refetchInterval` 20s while screen focused. Returns `{ token, isLoading, error, refetch }`. |
| `apps/mobile/src/hooks/useTokenTrades.ts` | `useQuery(['token', mint, 'trades'])` → `GET /tokens/[mint]/trades` (price/volume summary + recent trades). |
| `apps/mobile/src/hooks/useTokenFees.ts` | `useQuery(['token', mint, 'fees'])` → `GET /tokens/[mint]/fees` (fees-generated). Used in the fee-disclosure expandable + creator earnings line. |
| `apps/mobile/src/hooks/useTokenTrade.ts` | **The core trade state machine.** Owns quote → build → client-sign → submit → confirm. Mirrors `useSwap.ts` structure but signs ONLY (relay submits). See §5. |

### 1.3 Components (composites + features)
| File | Responsibility |
|---|---|
| `apps/mobile/src/components/composites/TokenStatRow.tsx` | 3-up inline stats (PRICE / 24H / MKT CAP) — wraps existing `StatsCard variant="inline"`; formats base-units + USD. |
| `apps/mobile/src/components/composites/FundraiseProgress.tsx` | Fundraise bar (raised/threshold/pct + venue badge). Reused by the FUNDRAISE-UI task too — design owns the API of this; coordinate (§10). |
| `apps/mobile/src/components/features/TradePanel.tsx` | The buy/sell form: amount input, BUY/SELL segmented, slippage control, live quote breakdown, fee/rebate disclosure, primary CTA. Pure presentational + calls `useTokenTrade`. |
| `apps/mobile/src/components/features/TradeStatusSheet.tsx` | Bottom-sheet/overlay covering `signing → submitting → confirming → success/fail` (mirrors `SwapModal` result screen + progress card). |
| `apps/mobile/src/components/features/FeeDisclosure.tsx` | Inline collapsible "~1% in-app vs higher elsewhere + rebate" explainer. Reused on launch + token detail. |
| `apps/mobile/src/components/features/RecentTradesList.tsx` | Recent trades rows (side, amount, time, signature link). |
| `apps/mobile/src/components/features/TradeScreenSkeleton.tsx` | Skeleton for the detail/trade route (mirrors `WalletSkeleton`/`SwapModal` skeleton blocks). |

### 1.4 Routes (Expo Router — file-based, auto-register)
| File | Responsibility |
|---|---|
| `apps/mobile/app/token/[mint].tsx` | **NEW canonical token DETAIL screen** keyed by MINT (price, venue, fundraise, fees, chart, recent trades) with a sticky BUY/SELL bar that opens the trade route. |
| `apps/mobile/app/token/[mint]/trade.tsx` | **NEW full-screen TRADE screen** (`?side=buy|sell`). Hosts `<TradePanel>` + `<TradeStatusSheet>`. |

### 1.5 Existing files to EDIT (entry points)
| File | Edit |
|---|---|
| `apps/mobile/app/creator/[id].tsx` | Replace `renderTokenTab()` body: drop hardcoded `tokenData`/`chartData`/`ComingSoonModal`; render real `<TokenStatRow>` + `<FundraiseProgress>` + chart fed by `useTokenDetail(profile.mintAddress)`; route BUY/SELL → `router.push('/token/'+mint+'/trade?side=buy')`. Keep PROFILE/POSTS tabs untouched. Requires `profile.mintAddress` + `profile.tokenSymbol` (confirm `useCreatorProfile` exposes mint; if not, fall back to `GET /tokens/[mint]` once a mint field is added — flagged §10). |
| `apps/mobile/src/hooks/index.ts` | Export `useTokenDetail`, `useTokenTrades`, `useTokenFees`, `useTokenTrade`. |
| `apps/mobile/src/components/composites/index.ts` | Export `TokenStatRow`, `FundraiseProgress`. |
| `apps/mobile/src/components/features/index.ts` | Export `TradePanel`, `TradeStatusSheet`, `FeeDisclosure`, `RecentTradesList`, `TradeScreenSkeleton`. |
| `apps/mobile/src/services/api.ts` | NO change — generic `get`/`post` already unwrap the `{success,data}` envelope. Use them directly. |

No new router config file: Expo Router registers `app/token/[mint].tsx` and `app/token/[mint]/trade.tsx`
automatically.

---

## 2. Types (`apps/mobile/src/types/token.ts`)

Mirror the API envelope DATA payloads exactly (money = base-unit STRINGS; USD = number; bps = number).

```ts
export type TradeSide = 'buy' | 'sell';
export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';

// GET /api/tokens/[mint] (§d.2)
export interface TokenDetail {
  mint: string; name: string; symbol: string; imageUrl: string | null;
  decimals: number; totalSupply: string; circulatingSupply: string;
  status: string; venue: TradeVenue; poolType: string | null; poolAddress: string | null;
  priceUsd: number; marketCapUsd: number; transferFeeBps: number;
  feeConfig: { creatorBps: number; momentoBps: number; rebateTargetBps: number; rebateMint: string };
  fundraise: { status: string; raisedBaseUnits: string; thresholdBaseUnits: string;
               progressPct: number; quoteMint: string } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}

// quote inside POST buy/sell (§d.3 `data.quote`)
export interface TradeQuote {
  expectedOutBase: string; minOutBase: string; priceUsd: number; priceTs: string;
  feeBase: string; feeBps: number; effectiveFeeBps: number;
  inAppRebateBase: string; rebateMint: string;
}

// POST /api/tokens/[mint]/{buy,sell} (§d.3)
export interface TradeBuildResponse {
  intentId: string; transaction: string; idempotencyKey: string;
  venue: TradeVenue; quote: TradeQuote;
}

// POST .../submit (§d.4)
export interface TradeSubmitResult {
  intentId: string; signature: string; venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING'; deduped: boolean;
}

// GET /api/tokens/[mint]/trades  (summary + recent) — shape per backend; assume:
export interface RecentTrade {
  side: TradeSide; amountInBase: string; amountOutBase: string;
  priceUsd: number; signature: string | null; blockTime: number | null; trader: string;
}
export interface TokenTradesSummary {
  priceUsd: number; change24hPct: number;
  volume24hBase: string; volume24hUsd: number; quoteMint: string; decimals: number;
  trades: RecentTrade[];
}

// GET /api/tokens/[mint]/fees — fees generated
export interface TokenFeesSummary {
  creatorFeesBase: string; momentoFeesBase: string; rebatesPaidBase: string;
  quoteMint: string; decimals: number;
}
```

> If `/trades` and `/fees` response fields differ from above, adjust this file ONLY — the components read
> through these types. The `/buy|/sell` `quote` field names (`expectedOutBase`, `minOutBase`, `feeBase`,
> `inAppRebateBase`, `effectiveFeeBps`) are **fixed** by §d.3 and load-bearing.

---

## 3. Screen: `app/token/[mint].tsx` — Token DETAIL

`useLocalSearchParams<{ mint: string }>()`. Layout top→bottom inside `SafeAreaView edges={['top']}`:

1. **Nav bar** — back chevron (`chevron-back`, 24, `#FFFFFF`) + token symbol `$SYMBOL`
   (`TYPOGRAPHY.h3`, uppercase) + creator handle w/ verified 8px dot. Mirrors `creator/[id].tsx` navBar.
2. **Hero** — token `imageUrl` (or creator avatar) `MediaImage`, `$SYMBOL` overlaid
   (`tokenHero`, fontSize 32, `monoLarge`). Same treatment as current TOKEN tab hero.
3. **`<TokenStatRow>`** — PRICE (`formatCurrency(priceUsd)`), 24H (`formatPercentage(change24hPct)`,
   color positive/negative), MKT CAP (`$`+`formatNumber(marketCapUsd)`). From `useTokenDetail` +
   `useTokenTrades`.
4. **`<FundraiseProgress>`** — render ONLY when `token.fundraise != null` (pre-graduation, venue
   `METEORA_DBC`). Bar + "RAISED 3.2K / 5.0K USDC · 64%" + status pill. When `fundraise == null` and
   `graduatedAt` set, render a small "GRADUATED · DAMM V2" badge instead.
5. **`<PerformanceChart>`** (existing composite) — fed by `usePriceHistory` if available for the mint,
   else `useTokenTrades` price points; chart is OPTIONAL/on-brand (single green `#00FF88` line). If no
   data, render empty-state line "PRICE HISTORY UNAVAILABLE" (`textTertiary`). Do NOT fabricate data
   (removes the sample array antipattern).
6. **`<FeeDisclosure>`** (collapsed by default) — see §7.
7. **`<RecentTradesList>`** — top N rows from `useTokenTrades().trades`; tap row → explorer
   (`CHAIN_CONFIG.solana.explorerUrl + '/tx/' + signature`). Empty → "NO TRADES YET".
8. **Sticky bottom BUY/SELL bar** — reuse `<BuySellPills>` pattern but push to trade route:
   `onBuy → router.push('/token/'+mint+'/trade?side=buy')`, `onSell → ...?side=sell`. Disabled (opacity
   0.4) + caption "NOT YET TRADEABLE" when `status !== 'ACTIVE'` and not graduated.

**States:** loading → `<TradeScreenSkeleton>`; error (`ApiError`) → centered alert-circle
`#FF4444` + "COULDN'T LOAD TOKEN" + retry pill; 404 → "TOKEN NOT FOUND". Pull-to-refresh →
`refetch()` on all three queries.

---

## 4. Screen: `app/token/[mint]/trade.tsx` — TRADE

`useLocalSearchParams<{ mint, side }>()`. Full screen (presented as a pushed route; on-brand,
not the system pageSheet so the keyboard + sticky CTA behave). Hosts `<TradePanel>` and overlays
`<TradeStatusSheet>` during the signing→confirm lifecycle.

**`<TradePanel>` (features) layout:**

1. **Header** — back/close + "BUY $SYMBOL" / "SELL $SYMBOL" (`h3`). Subtitle: venue badge
   (`METEORA DBC` / `DAMM V2`) `caption` `textSecondary`.
2. **Side toggle** — segmented BUY | SELL (reuse `PillTabs` styling; active green underline/fill).
   Changing side resets amount + quote.
3. **You pay card** (`SwapModal` `tokenCard` styling, surface `#1A1A1A`, border `#2A2A2A`, radius
   `RADII.lg`):
   - BUY: input mint = USDC (decimals 6); SELL: input mint = the creator token (decimals from
     `TokenDetail.decimals`).
   - `TextInput keyboardType="decimal-pad"`, right-aligned `h2`. Balance row + MAX (reuse
     `useWalletBalance`, exact pattern from `SwapModal` lines 94–117 / 378–392).
4. **Flip-less direction** — BUY/SELL is the direction selector (no flip button; the pair is always
   token↔USDC).
5. **You receive card** — read-only `quote.expectedOutBase` formatted to output decimals; spinner
   while `status==='quoting'`.
6. **Slippage control** — chips 0.1% / 0.5% / 1% + custom; default `MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS`
   (50 = 0.5%) from `@momento/shared`. Stored as `slippageBps`. Warn (`#FFB800`) if > 100bps.
7. **Quote breakdown card** (only when `quote`): rows —
   - Min received: `minOutBase` (fmt) + symbol
   - Price: `formatCurrency(quote.priceUsd)`
   - Network/transfer fee: `feeBase` (fmt) — label "FEE ({feeBps/100}%)"
   - **In-app rebate: `+inAppRebateBase` (fmt USDC), green `#00FF88`** — label "IN-APP REBATE"
   - **Effective fee: {effectiveFeeBps/100}%** — emphasize this is the ~1% in-app rate
8. **`<FeeDisclosure>`** inline (§7).
9. **Errors** — map `TradeError` codes (§6) to friendly copy in `errorBanner` (`SwapModal` styling).
10. **Primary CTA** — full-width `#00FF88` btn, black text, `RADII.md` (`SwapModal.swapButton`).
    Label logic: `Connect Wallet` / `Enter Amount` / `Min …` / `Insufficient {symbol}` / `Fetching
    Quote…` / `Quote Expired — Refresh` / `BUY $SYMBOL`|`SELL $SYMBOL`. Disabled per `canTrade`.

**Quote freshness:** auto-fetch debounced 500ms on amount/side/slippage change (mirror `SwapModal`
useEffect lines 130–150). Quote TTL 30s (mirror `useSwap` `QUOTE_MAX_AGE_MS`); expired → CTA flips to
"Quote Expired — Refresh".

---

## 5. Hook: `useTokenTrade.ts` — the client-signed state machine

Models the P3A flow which differs from `useSwap` in ONE critical way: **the API relays the submit**, so
the wallet must **sign-only** (`signTransaction`), NOT `signAndSendTransaction`.

```ts
type TradeStatus =
  | 'idle' | 'quoting' | 'building' | 'signing' | 'submitting' | 'confirming'
  | 'success' | 'error';

interface UseTokenTradeReturn {
  status: TradeStatus;
  quote: TradeQuote | null;
  build: TradeBuildResponse | null;
  result: TradeSubmitResult | null;
  error: { code?: string; message: string } | null;
  fetchQuote(p: { mint; side; amountInBase: string; slippageBps: number }): Promise<TradeBuildResponse | null>;
  executeTrade(): Promise<TradeSubmitResult | null>;
  reset(): void;
}
```

**Important contract note:** §d.3 has the `/buy|/sell` endpoint return BOTH the quote AND the unsigned
`transaction`+`intentId` in one call (build = quote). There is no separate quote endpoint. So
`fetchQuote()` actually POSTs `/tokens/[mint]/[side]` and stores the whole `TradeBuildResponse` (we surface
`.quote` for display, hold `.transaction`/`.intentId`/`.idempotencyKey` for submit). Re-POST on
amount/slippage/side change (debounced) to refresh the intent. This is the single source of truth for
"quote".

**Flow inside `executeTrade()`** (re-POSTs a fresh build first if the held one is >30s old):
1. Guard `walletAddress` (else `error.code='WALLET_NOT_READY'`).
2. `status='signing'`. `provider = await getWalletProvider()` (from `useAuth`). Decode
   `build.transaction` base64 → bytes (reuse `base64ToUint8Array` from `useSwap`; extract to
   `src/utils/solanaTx.ts` and import in both — see §10) → `VersionedTransaction.deserialize`.
3. **Sign only:** `const signed = await provider.request({ method: 'signTransaction', params: { transaction } })`.
   Re-serialize the signed tx → base64 (`btoa(String.fromCharCode(...signed.serialize()))`).
   > If the installed Privy Solana provider lacks `signTransaction` (only `signAndSendTransaction`),
   > FALL BACK is NOT valid here (the API must receive the signed-but-unsent tx). Flagged §10 as the
   > single integration risk to verify on device; `useSwap` proves `getProvider()` + `request()` work.
4. `status='submitting'`. `POST /tokens/[mint]/[side]/submit` with
   `{ intentId, transaction: signedBase64, idempotencyKey }`.
5. `status='confirming'` if `data.status==='PENDING'`; `status='success'` when `'CONFIRMED'`. On
   `PENDING`, poll `GET /tokens/[mint]/trades` (or re-submit which is idempotent → `deduped:true`) until
   the trade's `signature` appears confirmed, max ~30s, then show success with explorer link.
6. On any throw → map `ApiError.body.error` / `TradeError.code` → `error` (§6), `status='error'`.

**On success:** `queryClient.refetchQueries(['walletBalance'])` (immediate + 3s + 8s, per `SwapModal`),
invalidate `['token', mint]`, `['token', mint, 'trades']`, `['token', mint, 'fees']`. Persist a tx record
to AsyncStorage + `POST /wallet/transactions/log` (reuse `SwapModal` lines 173–200 pattern) labeled
`"{amt} {in} → {out} {symbol} (in-app)"`.

`reset()` clears all state (mirror `useSwap.reset`).

---

## 6. Error mapping (`TradeError` codes → copy)

| API code (`§b.2`) | User copy |
|---|---|
| `TOKEN_NOT_FOUND` | "Token not found." |
| `TOKEN_NOT_TRADEABLE` | "This token isn't tradeable yet." |
| `VENUE_UNRESOLVED` | "Market unavailable. Try again shortly." |
| `QUOTE_STALE` | "Quote expired — refresh and retry." (auto re-fetch) |
| `SLIPPAGE` | "Price moved past your slippage. Increase slippage or retry." |
| `AMOUNT_INVALID` | "Enter a valid amount." |
| `WALLET_NOT_READY` | "Your wallet is still setting up. Try again in a moment." |
| HTTP 400 "Wallet not ready" | same as `WALLET_NOT_READY` |
| HTTP 403 (submit, not owner) | "This trade belongs to another account." |
| `ApiError` 408 / network | "Network issue. Check your connection and retry." |
| fallback | the raw `error` message. |

`TradeStatusSheet` renders these in a red banner (`#FF4444` @ 8% bg, 20% border) with a RETRY pill that
calls `executeTrade()` (or `fetchQuote()` for stale).

---

## 7. Fee / tax disclosure (`FeeDisclosure.tsx`) — MANDATORY copy

Collapsed pill: shield-check icon `#00FF88` + "WHY TRADE IN-APP? ~1% FEE" + chevron.
Expanded card (`surface`, border `#2A2A2A`, `RADII.md`):

- "Trading **$SYMBOL** inside Momento costs about **1%** (effective fee shown above)."
- "On external venues the token's built-in transfer fee is **{transferFeeBps/100}%** — higher."
- "In-app trades earn a **rebate** (`{rebateTargetBps/100}%`, paid in USDC) that offsets most of the
  fee. The effective rate above already reflects it."
- Tertiary footnote: "Rebates are discretionary and may be paused. Not financial or tax advice."
  (matches `REBATE_LEGAL_APPROVED` gating posture; keep non-committal.)

Values come from `TokenDetail.feeConfig` + the live `quote.effectiveFeeBps`/`inAppRebateBase`. Same
component reused by the launch wizard's fee step (coordinate §10).

---

## 8. FundraiseProgress (`FundraiseProgress.tsx`)

Props: `{ fundraise: TokenDetail['fundraise']; decimals: number; symbol: string }`.
- Track: full-width `#2A2A2A` 6px bar, radius full; fill `#00FF88` to `progressPct`.
- Above: "FUNDRAISE" label (`label`) + status pill (ACTIVE/THRESHOLD MET/COMPLETED).
- Below: "RAISED {fmt(raisedBaseUnits, USDC 6)} / {fmt(thresholdBaseUnits)} USDC · {progressPct}%"
  (`caption`, raised value in `#00FF88`).
- Threshold met → pill `#00FF88` bg / black text "READY TO GRADUATE".

Quote/USDC base-units always 6 decimals (USDC). Token amounts use `TokenDetail.decimals`.

---

## 9. Formatting helpers (add to `apps/mobile/src/utils/formatters.ts`)

```ts
// base-unit string → human number (NO float for big ints; use BigInt division)
export function formatBaseUnits(base: string, decimals: number, maxFrac = 4): string;
// base-unit string → USD via priceUsd
export function formatBaseUsd(base: string, decimals: number, priceUsd: number): string;
```
Implement with `BigInt` to avoid precision loss on 9-decimal supplies. Display: amounts ≥ 1 →
2–4 frac; tiny → trimmed. Reuse existing `formatCurrency`/`formatNumber`/`formatPercentage`.

---

## 10. CROSS-CUTTING DECISIONS (other P3B designers MUST align)

1. **Shared types file `apps/mobile/src/types/token.ts` is owned by THIS task.** Launch / fundraise /
   vesting designers import `TokenDetail`, `TradeQuote`, `TradeSide`, `TradeVenue` from here — do not
   redefine. (Wire shapes traced from `CONTRACTS-P3A.md §b.2/§d.2/§d.3/§d.4.)
2. **Client-sign helper.** Extract `base64ToUint8Array` (+ new `uint8ArrayToBase64`) from `useSwap.ts`
   into `apps/mobile/src/utils/solanaTx.ts`; both `useSwap` and `useTokenTrade` (and the launch/vesting
   client-sign flows) import it. **Launch & vesting also use the same sign-only→submit pattern** — they
   should reuse the `useTokenTrade` signing internals (consider a shared `useClientSignedTx` primitive;
   propose THIS task seeds it, others adopt).
3. **`signTransaction` vs `signAndSendTransaction`.** P3A relays the submit, so all P3B client-signed
   flows (trade, launch creator-as-poolCreator alt, vesting create/withdraw) must **sign-only** via the
   Privy provider and POST the signed tx back. This is the #1 on-device integration risk — verify the
   provider exposes `signTransaction` early; coordinate one shared fix if not.
4. **`FeeDisclosure` and `FundraiseProgress` are shared composites** owned here; launch + fundraise tasks
   import rather than fork.
5. **Entry point into trade.** Canonical token screen is `app/token/[mint].tsx` (keyed by MINT). The
   creator profile TOKEN tab links into it. `market.tsx` / `portfolio.tsx` placeholders (`$0.004`) should
   migrate to `useTokenDetail` + link to `/token/[mint]` — out of scope here but FLAGGED so whoever owns
   those screens reuses this hook, not new code.
6. **`useCreatorProfile` must expose the token `mint`** (and `status`) for the profile TOKEN tab to wire.
   If it currently doesn't, the profile-screen edit needs a `mint` field added to the creator-profile
   payload/hook — flag to the profile/data owner; until then `app/token/[mint].tsx` is fully functional
   standalone via the mint.
7. **Slippage default** = `MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS` (50) from `@momento/shared` — single
   source, do not hardcode.

---

## 11. Design tokens used (quick ref)

`COLORS.background #000` · `surface #1A1A1A` · `primary #00FF88` · `error #FF4444` · `warning #FFB800` ·
`border #2A2A2A` · text `#FFFFFF`/`#888888`/`#555555`. `SPACING` xs4/sm8/md12/lg16/xl24. `RADII`
sm8/md12/lg16/full. `TYPOGRAPHY` h2(24)/h3(20)/body(16)/caption(12)/label(12 caps 1.5 tracking)/
monoLarge(24). Verified dot 8px `#00FF88`. CTA: `#00FF88` bg + `#000` text + `RADII.md` +
`paddingVertical SPACING.lg`. Cards: `surface` + 1px `border` + `RADII.lg`. Progress fill `#00FF88` on
`#2A2A2A` track.
```
