# D-datalayer-ui — Phase 3B Mobile Data Layer + Navigation Integration

> **Status:** IMPLEMENTATION-READY DESIGN. Owner: data-layer / nav task. Consumes the BINDING backend
> contract `docs/solana-migration/design/phase3/CONTRACTS-P3A.md` (§d endpoints, §e schemas, envelope
> `{success,data|error}`, money = base-unit strings). Powers the four Phase 3B screen tasks (launch wizard,
> token detail/trade, fundraise UI, vesting). This doc defines the **mobile contract** every other 3B
> designer codes against: API methods, hooks, the client-sign→submit helper, formatting utils, and the
> EXACT shared-file edits (entry points) that must be funneled through the foundation task.
>
> **Design tokens are MANDATORY** (repo CLAUDE.md): bg `#000000`, surface `#1A1A1A`, accent `#00FF88`,
> text `#FFFFFF`/`#888888`/`#555555`, border `#2A2A2A`, ALL-CAPS MONOSPACED wide tracking, verified =
> solid green 8px circle. All tokens already exist in `apps/mobile/src/styles/theme.ts` (`COLORS`,
> `SPACING`, `RADII`, `SHADOWS`). USE THOSE NAMES — never hardcode hex in new UI.

---

## 0. Conventions established by the existing app (do not deviate)

- **API client:** singleton `apiService` (`apps/mobile/src/services/api.ts`). It already (a) injects the
  Privy bearer token, (b) **unwraps the `{success,data}` envelope** and returns `data`, (c) throws
  `ApiError {status, body, message}` on non-2xx, (d) 15s timeout. **New methods just call
  `apiService.get/post`; never re-implement envelope unwrapping or auth.**
- **Hooks:** React Query (`@tanstack/react-query`). Read = `useQuery`; write = `useMutation`. Per-user
  query keys when data is account-scoped (see `useWalletBalance` keying on `user?.id`). Errors surfaced via
  `showErrorToast` from `@/utils/toast` for mutations; queries expose `error` to the screen.
- **Signing:** `useAuth().getWalletProvider()` returns the Privy Solana provider; sign+send via
  `provider.request({ method: 'signAndSendTransaction', params: { transaction, connection } })` with a
  `new Connection(EXPO_PUBLIC_HELIUS_RPC_URL, 'confirmed')`. `base64ToUint8Array` + `VersionedTransaction`
  pattern is in `useSwap.ts` — **lift it into a shared helper, don't copy.**
- **Money:** base-unit strings on the wire; format for display with token `decimals`. Never do float math on
  base units — use `bigint`.

---

## 1. Shared utility: base-unit formatting + tx decoding (NEW FILE)

`apps/mobile/src/utils/tokenAmount.ts` — **NEW**, no shared-file edit. The single formatting authority all
4 screens import.

```ts
/** base-unit string -> display string. baseToDisplay("1190000000", 9) => "1.19" */
export function baseToDisplay(base: string | bigint, decimals: number, opts?: {
  maxFracDigits?: number;  // default = min(decimals, 6)
  group?: boolean;         // thousands separators, default true
}): string;

/** display string -> base-unit string. displayToBase("1.19", 9) => "1190000000". Throws on >decimals frac. */
export function displayToBase(display: string, decimals: number): string;

/** USDC helpers (6 decimals, the quote mint). */
export const USDC_DECIMALS = 6;
export function usdcToDisplay(base: string): string;   // "$" + baseToDisplay(base,6,{maxFracDigits:2})

/** bps -> "1%" style. bpsToPct(100) => "1%"; bpsToPct(50) => "0.5%" */
export function bpsToPct(bps: number): string;

/** progress 0..100 clamp for fundraise bar. */
export function clampPct(n: number): number;
```

`apps/mobile/src/utils/solanaTx.ts` — **NEW**. Extracted from `useSwap`:

```ts
export function base64ToUint8Array(base64: string): Uint8Array;
export const SOLANA_RPC_URL: string;       // EXPO_PUBLIC_HELIUS_RPC_URL || mainnet
export function getConnection(): Connection; // memoized 'confirmed' connection
```

**Cross-cutting decision:** all 3B screens import `baseToDisplay`/`displayToBase`/`usdcToDisplay`/`bpsToPct`
from `@/utils/tokenAmount`. No screen formats base units inline.

---

## 2. API client methods — `apps/mobile/src/services/tokenApi.ts` (NEW FILE)

A thin typed wrapper over `apiService` grouped by domain. NEW file → **no shared-file contention**. (We do
NOT add methods onto the `ApiService` class; we export plain functions, matching how hooks already call
`apiService.get/post` directly. This file just centralizes paths + types.)

```ts
import { apiService } from '@/services/api';
import type * as P3 from './tokenApi.types';

// ── Token detail (d.2) ──
export const getTokenDetail = (mint: string) =>
  apiService.get<P3.TokenDetailResponse>(`/tokens/${mint}`);

// ── Launch (d.1) ──
export const launchToken = (body: P3.LaunchTokenRequest) =>
  apiService.post<P3.LaunchTokenResponse>('/tokens/launch', body);

// ── Trade build (d.3) ── side: 'buy' | 'sell'
export const buildTrade = (mint: string, side: 'buy' | 'sell', body: P3.TradeOrderRequest) =>
  apiService.post<P3.TradeBuildResponse>(`/tokens/${mint}/${side}`, body);

// ── Trade submit (d.4) ──
export const submitTrade = (mint: string, side: 'buy' | 'sell', body: P3.TradeSubmitRequest) =>
  apiService.post<P3.TradeSubmitResponse>(`/tokens/${mint}/${side}/submit`, body);

// ── Vesting (d.7/d.8/d.9) ──
export const createVesting = (body: P3.VestingCreateRequest) =>
  apiService.post<P3.VestingCreateResponse>('/vesting/create', body);
export const listVesting = (params?: { role?: 'recipient' | 'sender'; mint?: string }) =>
  apiService.get<P3.VestingListItem[]>('/vesting/list', params);
export const withdrawVesting = (id: string) =>
  apiService.post<P3.VestingWithdrawResponse>(`/vesting/${id}/withdraw`, {});

// ── Trades / fees feeds (prompt-listed; see §2.1 caveat) ──
export const getTokenTrades = (mint: string, params?: { limit?: number; cursor?: string }) =>
  apiService.get<P3.TradeFeedItem[]>(`/tokens/${mint}/trades`, params);
export const getTokenFees = (mint: string) =>
  apiService.get<P3.TokenFeesResponse>(`/tokens/${mint}/fees`);
export const getCreatorFees = (creatorId: string) =>
  apiService.get<P3.CreatorFeesResponse>(`/creators/${creatorId}/fees`);
```

### 2.1 Endpoint-availability caveat (FLAG for foundation/trade tasks)

The binding CONTRACTS-P3A §d specifies: launch, token detail, buy/sell, buy/sell/submit, vesting
create/list/withdraw, **admin** fee-claim (`POST /api/creators/[id]/fees/claim`), graduate cron. The prompt
additionally names **read** feeds `GET /api/tokens/[mint]/{trades,fees}` and `GET /api/creators/[id]/fees`
which are NOT in the binding §d table. **Decision:** implement `getTokenTrades`/`getTokenFees`/
`getCreatorFees` as designed (they read existing `Trade`/`FeeEvent` rows), but gate their hooks behind a
feature flag `EXPO_PUBLIC_FEES_FEED_ENABLED` and render the empty state until the backend read routes land.
The fundraise/trade/vesting screens have ZERO hard dependency on these three. **Action item for the
foundation task: confirm whether these read routes exist; if not, file them as P3-trade follow-ups.**

---

## 3. Types — `apps/mobile/src/services/tokenApi.types.ts` (NEW FILE)

Reuse `@momento/shared` where a type already exists (`PoolType`, `TradeSide`, `VestingStatus`,
`VestingProvider`, `CreatorToken`, `TokenFundraise`). Add **mobile view types** only for endpoint
request/response envelopes (the contract's wire shapes differ from the DB models — e.g. detail flattens
fee config + fundraise). Mirror §d JSON exactly.

```ts
import type { PoolType } from '@momento/shared';

export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';

// d.2
export interface TokenDetailResponse {
  mint: string; name: string; symbol: string; imageUrl: string | null;
  decimals: number; totalSupply: string; circulatingSupply: string;
  status: string; venue: TradeVenue; poolType: PoolType | null; poolAddress: string | null;
  priceUsd: number; marketCapUsd: number; transferFeeBps: number;
  feeConfig: { creatorBps: number; momentoBps: number; rebateTargetBps: number; rebateMint: string };
  fundraise: {
    status: string; raisedBaseUnits: string; thresholdBaseUnits: string;
    progressPct: number; quoteMint: string;
  } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}

// d.1
export interface LaunchTokenRequest {
  name: string; symbol: string; description?: string; imageUrl?: string;
  totalSupply?: string; decimals?: number; transferFeeBps?: number;
  feeSplit?: { creatorBps: number; partnerBps: number };
  fundraise: {
    targetUsd: number; initialMarketCapUsd?: number;
    partnerLockedLpPct?: number; partnerLpPct?: number;
    creatorLockedLpPct?: number; creatorLpPct?: number;
    minContributionBaseUnits?: string; maxContributionBaseUnits?: string;
  };
}
export interface LaunchTokenResponse {            // server-signed default (200)
  tokenId: string; mintAddress: string; dbcConfigKey: string; dbcPoolAddress: string;
  poolType: 'METEORA_DBC'; status: 'DEPLOYING' | 'ACTIVE';
  configSignature: string; poolSignature: string;
  // alt creator-as-poolCreator path: { transaction, tokenId, status:'DEPLOYING' }
  transaction?: string;
}

// d.3 quote nested in build response
export interface TradeQuoteWire {
  expectedOutBase: string; minOutBase: string; priceUsd: number; priceTs: string;
  feeBase: string; feeBps: number; effectiveFeeBps: number;
  inAppRebateBase: string; rebateMint: string;
}
export interface TradeOrderRequest { amountInBase: string; inputMint?: 'USDC'; slippageBps?: number; }
export interface TradeBuildResponse {
  intentId: string; transaction: string; idempotencyKey: string;
  venue: TradeVenue; quote: TradeQuoteWire;
}
// d.4
export interface TradeSubmitRequest { intentId: string; transaction: string; idempotencyKey: string; }
export interface TradeSubmitResponse {
  intentId: string; signature: string; venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING'; deduped: boolean;
}

// d.7
export interface VestingCreateRequest {
  kind: 'vesting' | 'lock'; tokenId: string; mint: string; recipient: string;
  amountBase: string; cliffAmountBase?: string;
  startAt: number; cliffAt: number; endAt: number; unlockEvery: number;
}
export interface VestingCreateResponse {
  vestingId: string; provider: string; streamId: string;
  signMode: 'client' | 'server';
  transaction?: string; createSignature?: string | null; netDepositBase: string;
}
// d.8
export interface VestingListItem {
  vestingId: string; mint: string; symbol: string; role: 'recipient' | 'sender';
  totalBase: string; withdrawnBase: string; claimableBase: string;
  cliffAt: number; endAt: number; status: string;
}
// d.9
export interface VestingWithdrawResponse { transaction: string; claimableBase: string; }

// §2.1 best-effort feeds
export interface TradeFeedItem {
  side: 'BUY' | 'SELL'; amountInBase: string; amountOutBase: string;
  priceUsd: number; signature: string; blockTime: string | null; traderWallet: string;
}
export interface TokenFeesResponse {
  creatorClaimableBase: string; momentoClaimableBase: string; totalRebatedBase: string; quoteMint: string;
}
export interface CreatorFeesResponse {
  totalClaimedBase: string; totalClaimableBase: string; quoteMint: string;
  perToken: { mint: string; symbol: string; claimableBase: string }[];
}
```

---

## 4. The reusable Privy CLIENT-SIGN→SUBMIT helper (NEW FILE) — cross-cutting

`apps/mobile/src/hooks/useClientSignSubmit.ts` — **NEW**. Generalizes `useSwap.executeSwap`. This is THE
shared primitive for every client-signed flow (trade buy/sell, vesting create client path, vesting
withdraw). **Every 3B screen that signs MUST use this — no duplicated signing logic.**

```ts
type SignStatus = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

interface SignSubmitArgs {
  /** base64 unsigned tx from the build/create endpoint */
  transaction: string;
  /** called AFTER the wallet signs+sends, returns the on-chain signature; do the matching
   *  /submit POST here (so the helper stays endpoint-agnostic). Receives the signature. */
  submit: (signature: string) => Promise<{ signature: string; status?: string; deduped?: boolean }>;
}
interface UseClientSignSubmit {
  status: SignStatus;
  error: string | null;
  signature: string | null;
  run: (args: SignSubmitArgs) => Promise<{ signature: string; deduped: boolean } | null>;
  reset: () => void;
}
export function useClientSignSubmit(): UseClientSignSubmit;
```

**Internal flow (mirrors `useSwap`, hardened):**
1. `status='signing'`; guard `walletAddress` (else error "Wallet not ready" — matches backend gate).
2. `getWalletProvider()`; throw if null ("Wallet provider not available. Please reconnect.").
3. `tx = VersionedTransaction.deserialize(base64ToUint8Array(transaction))` (from `@/utils/solanaTx`).
4. `provider.request({ method:'signAndSendTransaction', params:{ transaction: tx, connection } })` →
   `{ signature }`. `status='submitting'`.
5. `await args.submit(signature)` (the screen's hook passes its `.../submit` POST here). `status='confirming'`.
6. Poll `connection.getSignatureStatuses([signature])` until `confirmed`/`finalized` OR the submit response
   already says `status:'CONFIRMED'` (then skip polling). Max ~30s, then leave as `confirming`→ treat as
   `PENDING` (not a hard error; backend is idempotent). `status='success'`.
7. Map errors to friendly strings; `console.warn` (never `console.error` — red-box). Return `null` on error.

> **NOTE on the submit-shape difference vs useSwap:** P3A is build→sign→**explicit submit endpoint**
> (returns its own signature/deduped), unlike `useSwap` which signs the Jupiter tx and is done. The helper
> therefore takes a `submit` callback so the trade hook posts `{intentId, transaction:signedB64,
> idempotencyKey}` and the vesting hooks post nothing extra. The signed-tx base64 needed by the submit
> endpoint = re-serialize after sign IF the provider returns the signed tx; Privy's `signAndSendTransaction`
> already broadcasts, so for P3A submit we send the **original built tx base64** back with the obtained
> `signature` (backend dedupes on `intentId`+signature). **Cross-cutting open item to confirm with P3-trade:
> does `/submit` need the client-signed serialized tx, or just intentId+signature?** §d.4 shows
> `transaction:"<base64-client-signed>"`. If Privy broadcasts and does NOT return raw signed bytes, we must
> use `signTransaction` (not `signAndSendTransaction`) then submit the serialized signed tx and let the
> backend relay. **DECISION: use `signTransaction` for P3A trades/vesting** (so we can hand the signed
> base64 to `/submit`), reserving `signAndSendTransaction` only where no submit endpoint exists. The helper
> exposes a `mode: 'signOnly' | 'signAndSend'` arg; trade/vesting use `'signOnly'`.

Final helper signature adds `mode`:
```ts
run: (args: SignSubmitArgs & { mode?: 'signOnly' | 'signAndSend' }) => ...
// signOnly: provider.request({method:'signTransaction',...}) -> serialize -> pass signedBase64 to submit()
```

---

## 5. React Query hooks (NEW FILES, one per file under `src/hooks/`)

All exported from `src/hooks/index.ts` (that index edit is internal to the data-layer task, not a
cross-task contended file — but **listed in §7** so the foundation task is aware).

### 5.1 `useTokenDetail.ts`
```ts
export function useTokenDetail(mint: string | undefined) {
  return useQuery({
    queryKey: ['tokenDetail', mint],
    queryFn: () => getTokenDetail(mint!),
    enabled: !!mint,
    staleTime: 15_000,
    refetchInterval: (q) => q.state.data?.status === 'ACTIVE' ? 20_000 : false, // live price pre-grad
  });
}
```
Returns `{ data, isLoading, error, refetch }`. Drives token detail header + fundraise bar + fee disclosure.

### 5.2 `useTokenTradeQuote.ts` + `useSubmitTrade.ts`
Quote = a **mutation** (build is a POST that persists an intent), not a query — but screens want
debounced-on-amount-change behavior. Pattern: expose a `getQuote` mutation + cache last build response in
ref (like `useSwap` quoteRef + 30s TTL).
```ts
export function useTokenTradeQuote(mint: string, side: 'buy'|'sell') {
  const build = useMutation({ mutationFn: (b: TradeOrderRequest) => buildTrade(mint, side, b) });
  // exposes build.mutateAsync, build.data (TradeBuildResponse), staleness via builtAtRef (30s)
  return { build, ... };
}

export function useSubmitTrade(mint: string, side: 'buy'|'sell') {
  const { run, status, error } = useClientSignSubmit();
  const qc = useQueryClient();
  const submit = async (build: TradeBuildResponse) => run({
    mode: 'signOnly',
    transaction: build.transaction,
    submit: (signedOrSig) => submitTrade(mint, side, {
      intentId: build.intentId,
      transaction: signedOrSig,            // signOnly => signed base64
      idempotencyKey: build.idempotencyKey,
    }),
  });
  // onSuccess: qc.invalidateQueries(['tokenDetail',mint]); startFastPolling on walletBalance; toast
  return { submit, status, error };
}
```
**Cross-cutting:** trade screen calls `getQuote` on amount change (debounce 400ms), shows the quote
(expected out, min out, effective fee, rebate), then `submit(build)`. Re-quote if build is >30s old before
submit (reuse `useSwap`'s expiry message).

### 5.3 `useLaunchToken.ts`
```ts
export function useLaunchToken() {
  const { run } = useClientSignSubmit();
  return useMutation({
    mutationFn: async (body: LaunchTokenRequest) => {
      const res = await launchToken(body);
      if (res.transaction) {                 // alt creator-as-poolCreator path (signMode client)
        await run({ mode:'signAndSend', transaction: res.transaction, submit: async (s)=>({signature:s}) });
      }
      return res;
    },
    onSuccess: (res) => { /* invalidate ['creator', userId]; route to /token/[mint] */ },
    onError: (e) => showErrorToast(launchErrorMessage(e)),  // maps 402/409/202 (see §6)
  });
}
```

### 5.4 `useVestingList.ts` + `useWithdrawVesting.ts`
```ts
export function useVestingList(role: 'recipient'|'sender' = 'recipient', mint?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['vesting', user?.id, role, mint ?? null],
    queryFn: () => listVesting({ role, mint }),
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}
export function useWithdrawVesting() {
  const { run, status, error } = useClientSignSubmit();
  const qc = useQueryClient();
  const withdraw = async (vestingId: string) => {
    const { transaction, claimableBase } = await withdrawVesting(vestingId); // d.9 returns unsigned tx
    if (claimableBase === '0') { showErrorToast('Nothing to withdraw'); return null; }
    return run({ mode:'signAndSend', transaction, submit: async (s)=>({signature:s}) });
  };
  // onSuccess: qc.invalidateQueries(['vesting']); toast 'Withdrawal submitted'
  return { withdraw, status, error };
}
```
> Vesting withdraw `/withdraw` returns ONLY an unsigned tx (no submit endpoint in §d.9) → use
> `signAndSend`. Vesting **create** returns `signMode` discriminator: `server` ⇒ done (`createSignature`
> set); `client` ⇒ sign+send the returned `transaction` (no submit endpoint either ⇒ `signAndSend`).

### 5.5 `useCreateVesting.ts`
```ts
export function useCreateVesting() {
  const { run } = useClientSignSubmit();
  return useMutation({
    mutationFn: async (body: VestingCreateRequest) => {
      const res = await createVesting(body);
      if (res.signMode === 'client' && res.transaction)
        await run({ mode:'signAndSend', transaction: res.transaction, submit: async(s)=>({signature:s}) });
      return res;
    },
    onSuccess: () => qc.invalidateQueries(['vesting']),
  });
}
```

### 5.6 `useTokenFees.ts` + `useCreatorFees.ts` (gated, §2.1)
```ts
export function useTokenFees(mint?: string) {
  return useQuery({ queryKey:['tokenFees',mint], queryFn:()=>getTokenFees(mint!),
    enabled: !!mint && ENV.FEES_FEED_ENABLED });
}
export function useCreatorFees(creatorId?: string) {
  return useQuery({ queryKey:['creatorFees',creatorId], queryFn:()=>getCreatorFees(creatorId!),
    enabled: !!creatorId && ENV.FEES_FEED_ENABLED });
}
```

---

## 6. Loading / error / empty / disabled state conventions

Reuse existing primitives: `LoadingView`, `Skeleton`, `ChartSkeleton`, `Button` (has loading state),
`Card`, `Text`. Per-state spec all screens follow:

| State | Trade | Token detail | Fundraise | Vesting list | Launch wizard |
|---|---|---|---|---|---|
| **loading** | quote: inline spinner on CTA; submit: status text "SIGNING…/SUBMITTING…/CONFIRMING…" | `ChartSkeleton`+header skeleton | shimmer bar | `Skeleton` rows ×3 | step disabled, CTA spinner |
| **error** | red `COLORS.error` helper text under input + toast | full-screen retry (`LoadingView` error variant) | hide bar, show "—" | toast + retry row | toast, keep form data |
| **empty** | n/a | n/a | pre-launch: "FUNDRAISE NOT STARTED" | "NO VESTING SCHEDULES" centered, tertiary | n/a |
| **disabled** | CTA disabled when amount=0 / quote stale / wallet not ready / insufficient balance | BUY/SELL disabled if `status!=='ACTIVE'` && not graduated | — | WITHDRAW disabled when `claimableBase==='0'` | NEXT disabled until step valid |

**Status→copy map (client-sign helper):** `signing`→"SIGNING…", `submitting`→"SUBMITTING…",
`confirming`→"CONFIRMING…", `success`→"DONE", `error`→error text. All ALL-CAPS monospaced.

**Error code mapping** (`ApiError.status` / `body.error`):
- 400 `Wallet not ready` → "Connect or fund your wallet to trade." (offer FundWalletModal)
- 402 `INSUFFICIENT_FUNDS` → "Not enough USDC. Add funds." (launch + buy)
- 409 one-token-per-creator → "You already have a token."
- 202 DEPLOYING / `status:'PENDING'` → success-ish: "Submitted — finalizing on-chain." (not a hard error)
- `SLIPPAGE`/`QUOTE_STALE` → "Price moved. Re-quote and try again." (auto re-quote)
- 403 (submit not owner) → "This trade isn't yours."
- default → `ApiError.message`.

**Disabled-CTA color:** `COLORS.surfaceElevated` bg, `COLORS.textTertiary` text (existing `Button`
disabled style). Primary CTA enabled = `COLORS.primary` bg, `COLORS.textInverse` text.

---

## 7. Navigation / entry points — NEW route files + EXACT shared-file edits

### 7.1 NEW route files (Expo Router file-based — auto-register, NO shared router edit)
| New file | Screen | Owner task |
|---|---|---|
| `apps/mobile/app/token/[mint].tsx` | Token DETAIL + buy/sell TRADE (replaces creator TOKEN-tab placeholder destination) | P3B-trade |
| `apps/mobile/app/launch.tsx` (or `app/launch/index.tsx` if multi-step uses sub-routes) | Creator LAUNCH wizard | P3B-launch |
| `apps/mobile/app/vesting.tsx` | Vesting LIST + withdraw | P3B-vesting |
| `apps/mobile/app/vesting/create.tsx` (optional) | Creator create vesting/lock | P3B-vesting |

Fundraise progress + fee/tax disclosure are **components**, not routes — see §8.

### 7.2 EXISTING files needing a tap-target/link edit — THE ONLY SHARED-FILE EDITS (flag for foundation)
These four edits are the entire shared-surface footprint of 3B mobile. **Funnel through the foundation /
this data-layer task to avoid two screen tasks editing the same file:**

1. **`apps/mobile/app/creator/[id].tsx`** — `renderTokenTab()` currently wires BUY/SELL to
   `setShowComingSoon(true)` (line ~318) and hardcodes `price:'0.004'` (line ~75). EDIT: replace the
   `ComingSoonModal` trigger with `router.push('/token/' + mint)` (mint from creator's `CreatorToken`),
   and source price/stats from `useTokenDetail`. Remove the `ComingSoonModal` import/usage.
2. **`apps/mobile/app/market.tsx`** — `handleBuyPress` / row BUY button (lines ~234) currently route to
   creator. EDIT: route BUY → `router.push('/token/' + mint)`. (Needs creator→mint; see §7.3.)
3. **`apps/mobile/app/(tabs)/profile.tsx`** — add a creator-only "LAUNCH TOKEN" CTA (near the existing
   "Become a Creator" CTA, line ~362) → `router.push('/launch')`, shown when `isCreator` and creator has
   NO token yet; and a "VESTING" entry in the creator content section → `router.push('/vesting')`.
4. **`apps/mobile/src/hooks/index.ts`** — re-export the new hooks (internal, low-risk, but listed for
   completeness).

> No other existing file is touched by 3B screens. `theme.ts`, `components/index.ts`, primitives — read
> only. If a screen needs a new shared component it lives in a NEW file under `components/features` and is
> added to that barrel by the screen's own task (single-writer per new file).

### 7.3 The creator→mint resolution gap (cross-cutting — RESOLVE in foundation)
`PublicCreator` (shared types) and the `/creators/[id]` response do **NOT** currently expose the token
`mintAddress`. Entry points #1/#2 need it to deep-link `/token/[mint]`. **Two options, pick in foundation:**
- (A) **Preferred:** add `tokenMint?: string` (and `tokenId?`) to the `/creators/[id]` response +
  `PublicCreator` type (one shared-type edit, foundation-owned). Then `creator/[id]` and `market` link
  straight to it.
- (B) Fallback: route by creator id to `/token/by-creator/[id]` — requires a new backend route (worse).
**DECISION: go with (A).** This is the one `@momento/shared` change 3B needs; everything else reuses
existing types. Flag to backend foundation owner.

---

## 8. Reusable NEW components (each in its own file → no contention)

Under `apps/mobile/src/components/features/` (added to that barrel by the owning screen task):
- **`FundraiseProgress.tsx`** (P3B-fundraise) — props `{ raisedBase, thresholdBase, quoteMint, progressPct,
  status, contributorCount? }`. Bar track `COLORS.surface`, fill `COLORS.primary`, labels via `usdcToDisplay`.
  ALL-CAPS "RAISED / GOAL", pct big monospaced. Empty/pre-launch + COMPLETED ("GRADUATED ✓ green") states.
- **`FeeDisclosure.tsx`** (P3B-trade) — props `{ feeBps, effectiveFeeBps, rebateBase, rebateMint, decimals }`.
  Renders the in-app ~1% vs higher-elsewhere line + rebate explanation. Surface card, `bpsToPct`,
  green emphasis on the savings. Reused on trade screen + launch confirm. **Single source of fee copy.**
- **`TradePanel.tsx`** (P3B-trade) — buy/sell amount input + quote summary + CTA; consumes
  `useTokenTradeQuote`+`useSubmitTrade`. Mirrors `TokenSwapWidget`/`SwapModal` layout & tokens.
- **`VestingRow.tsx`** (P3B-vesting) — one schedule: symbol, claimable (green), progress, WITHDRAW pill
  (disabled when `claimableBase==='0'`).

Reuse as-is: `BuySellPills`, `PerformanceChart`/`PortfolioChart`, `StatsCard`, `PillTabs`, `Card`, `Button`,
`PillButton`, `Text`, `Avatar`, `FundWalletModal` (offer when wallet-not-ready/insufficient).

---

## 9. Summary of file ownership (so tasks never collide)

- **This (data-layer) task CREATES:** `services/tokenApi.ts`, `services/tokenApi.types.ts`,
  `utils/tokenAmount.ts`, `utils/solanaTx.ts`, `hooks/useClientSignSubmit.ts`, `hooks/useTokenDetail.ts`,
  `hooks/useTokenTradeQuote.ts`, `hooks/useSubmitTrade.ts`, `hooks/useLaunchToken.ts`,
  `hooks/useVestingList.ts`, `hooks/useCreateVesting.ts`, `hooks/useWithdrawVesting.ts`,
  `hooks/useTokenFees.ts`, `hooks/useCreatorFees.ts`; EDITS `hooks/index.ts` + `services/index.ts`.
- **This task also OWNS the 3 entry-point edits** (`creator/[id].tsx`, `market.tsx`, `(tabs)/profile.tsx`)
  to keep them single-writer.
- **Foundation/backend action items:** (a) confirm/file the trades/fees read routes (§2.1); (b) add
  `tokenMint`/`tokenId` to `/creators/[id]` + `PublicCreator` (§7.3); (c) confirm `/submit` needs the
  client-signed serialized tx vs intentId+signature (§4) → drives signOnly vs signAndSend.
