# CONTRACTS-P3B — Binding Mobile Contract (Phase 3B)

> ZERO-AMBIGUITY contract for concurrent build. Companion: `SPEC-P3B.md` (design rationale).
> Backend: `docs/solana-migration/design/phase3/CONTRACTS-P3A.md` (§b.2, §d.1–d.9, §e).
> Rule enforced here: **concurrent tasks NEVER share a file.** `P3B-foundation` owns ALL shared/contended
> files (api wrappers, wire types, utils, the shared sign hook, every React Query hook, every SHARED
> component, every barrel edit, and every edit to an EXISTING screen). The three screen tasks own ONLY their
> NEW route + component files and write to their OWN barrel lines that foundation has NOT touched — to keep
> single-writer on barrels, **foundation pre-adds the export lines for the screen tasks' components too**
> (see §b.0). Build foundation FIRST, then launch/trade/vesting in parallel.

---

## (a) Component / hook / screen SIGNATURES

### a.1 Utilities — `src/utils/tokenAmount.ts` + `src/utils/solanaTx.ts` (foundation)
```ts
// tokenAmount.ts
export const USDC_DECIMALS = 6;
export function baseToDisplay(base: string | bigint, decimals: number, opts?: { maxFracDigits?: number; group?: boolean }): string;
export function displayToBase(display: string, decimals: number): string;   // throws on > decimals frac digits
export function formatBaseUnits(base: string, decimals: number, maxFrac?: number): string; // alias of baseToDisplay (D-trade/D-vesting name)
export function usdcToDisplay(base: string): string;     // "$" + baseToDisplay(base, 6, {maxFracDigits:2})
export function formatUsd(base: string, decimals?: number): string;          // decimals default 6 (D-vesting name)
export function bpsToPct(bps: number): string;           // 100 -> "1%", 50 -> "0.5%"
export function clampPct(n: number): number;             // 0..100

// solanaTx.ts
import { Connection, VersionedTransaction } from '@solana/web3.js';
export const SOLANA_RPC_URL: string;                     // EXPO_PUBLIC_HELIUS_RPC_URL || mainnet (match useSwap)
export function base64ToUint8Array(base64: string): Uint8Array;   // lifted from useSwap
export function uint8ArrayToBase64(bytes: Uint8Array): string;    // NEW — needed by signOnly re-serialize
export function getConnection(): Connection;             // memoized 'confirmed'
export function deserializeTx(base64: string): VersionedTransaction;
```

### a.2 Wire types — `src/services/tokenApi.types.ts` (foundation; SINGLE types file)
Mirror §d JSON exactly (money = base-unit strings; usd = number; bps = number; unix seconds = number).
Reuse `@momento/shared` (`PoolType`, `TradeSide`, `VestingStatus`) where present.
```ts
export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';
export type TradeSideStr = 'buy' | 'sell';

export interface TokenDetailResponse { /* d.2 */
  mint: string; name: string; symbol: string; imageUrl: string | null;
  decimals: number; totalSupply: string; circulatingSupply: string;
  status: string; venue: TradeVenue; poolType: string | null; poolAddress: string | null;
  priceUsd: number; marketCapUsd: number; transferFeeBps: number;
  feeConfig: { creatorBps: number; momentoBps: number; rebateTargetBps: number; rebateMint: string };
  fundraise: { status: string; raisedBaseUnits: string; thresholdBaseUnits: string; progressPct: number; quoteMint: string } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}
export interface LaunchTokenRequest { /* d.1 */
  name: string; symbol: string; description?: string; imageUrl?: string;
  totalSupply?: string; decimals?: number; transferFeeBps?: number;
  feeSplit?: { creatorBps: number; partnerBps: number };
  fundraise: { targetUsd: number; initialMarketCapUsd?: number;
    partnerLockedLpPct?: number; partnerLpPct?: number; creatorLockedLpPct?: number; creatorLpPct?: number; };
}
export interface LaunchTokenResponse { /* d.1 server-signed default; alt path adds transaction */
  tokenId: string; mintAddress: string; dbcConfigKey: string; dbcPoolAddress: string;
  poolType: 'METEORA_DBC'; status: 'DEPLOYING' | 'ACTIVE';
  configSignature: string; poolSignature: string; transaction?: string;
}
export interface TradeQuoteWire { /* d.3 .quote */
  expectedOutBase: string; minOutBase: string; priceUsd: number; priceTs: string;
  feeBase: string; feeBps: number; effectiveFeeBps: number; inAppRebateBase: string; rebateMint: string;
}
export interface TradeOrderRequest { amountInBase: string; inputMint?: string; slippageBps?: number; }
export interface TradeBuildResponse { intentId: string; transaction: string; idempotencyKey: string; venue: TradeVenue; quote: TradeQuoteWire; } /* d.3 */
export interface TradeSubmitRequest { intentId: string; transaction: string; idempotencyKey: string; } /* d.4 — transaction = CLIENT-SIGNED base64 */
export interface TradeSubmitResponse { intentId: string; signature: string; venue: TradeVenue; status: 'CONFIRMED' | 'PENDING'; deduped: boolean; } /* d.4 */
export interface VestingCreateRequest { kind: 'vesting' | 'lock'; tokenId: string; mint: string; recipient: string;
  amountBase: string; cliffAmountBase?: string; startAt: number; cliffAt: number; endAt: number; unlockEvery: number; } /* d.7 */
export interface VestingCreateResponse { vestingId: string; provider: string; streamId: string;
  signMode: 'client' | 'server'; transaction?: string; createSignature?: string | null; netDepositBase: string; } /* d.7 */
export interface VestingListItem { vestingId: string; mint: string; symbol: string; role: 'recipient' | 'sender';
  totalBase: string; withdrawnBase: string; claimableBase: string; cliffAt: number; endAt: number; status: string;
  kind?: 'vesting' | 'lock'; decimals?: number; } /* d.8 — kind/decimals TODO(contract) default vesting/9 */
export interface VestingWithdrawResponse { transaction: string; claimableBase: string; } /* d.9 — no submit endpoint */
// §2.1 best-effort feeds (gated)
export interface TradeFeedItem { side: 'BUY' | 'SELL'; amountInBase: string; amountOutBase: string; priceUsd: number; signature: string; blockTime: string | null; traderWallet: string; }
export interface TokenFeesResponse { creatorClaimableBase: string; momentoClaimableBase: string; totalRebatedBase: string; quoteMint: string; }
export interface CreatorFeesResponse { totalClaimedBase: string; totalClaimableBase: string; quoteMint: string; perToken: { mint: string; symbol: string; claimableBase: string }[]; }
```

### a.3 Shared sign hook — `src/hooks/useClientSignSubmit.ts` (foundation)
```ts
type SignStatus = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';
interface SignSubmitArgs {
  transaction: string;                                   // base64 unsigned (from build/create/withdraw)
  mode?: 'signOnly' | 'signAndSend';                     // default 'signOnly'
  // For signOnly: receives the CLIENT-SIGNED base64 tx; do the matching /submit POST and return its result.
  // For signAndSend: receives the on-chain signature (provider already broadcast); usually a no-op pass-through.
  submit: (signedOrSignature: string) => Promise<{ signature: string; status?: string; deduped?: boolean }>;
}
interface UseClientSignSubmit {
  status: SignStatus; error: string | null; signature: string | null;
  run: (args: SignSubmitArgs) => Promise<{ signature: string; deduped: boolean } | null>;
  reset: () => void;
}
export function useClientSignSubmit(): UseClientSignSubmit;
// signOnly: provider.request({method:'signTransaction',params:{transaction}}) -> uint8ArrayToBase64(serialize) -> submit(signedB64)
// signAndSend: provider.request({method:'signAndSendTransaction',params:{transaction,connection}}) -> submit(signature)
// Guards walletAddress + null provider; console.warn (never console.error); returns null on error.
```

### a.4 React Query hooks (foundation; each its own file, all re-exported from `hooks/index.ts`)
```ts
export function useTokenDetail(mint?: string): UseQueryResult<TokenDetailResponse>; // key ['tokenDetail',mint]; staleTime 15s; refetchInterval 20s while status==='ACTIVE'
export function useTokenTrades(mint?: string): UseQueryResult<TradeFeedItem[]>;     // key ['tokenTrades',mint]; gated by ENV.FEES_FEED_ENABLED
export function useTokenFees(mint?: string): UseQueryResult<TokenFeesResponse>;     // key ['tokenFees',mint]; gated
export function useCreatorFees(creatorId?: string): UseQueryResult<CreatorFeesResponse>; // key ['creatorFees',id]; gated
export function useTokenTradeQuote(mint: string, side: 'buy'|'sell'): {            // build mutation + 30s staleness ref
  build: UseMutationResult<TradeBuildResponse, ApiError, TradeOrderRequest>;
  getQuote: (b: TradeOrderRequest) => Promise<TradeBuildResponse | null>;
  data: TradeBuildResponse | null; isStale: () => boolean;
};
export function useSubmitTrade(mint: string, side: 'buy'|'sell'): {
  submit: (build: TradeBuildResponse) => Promise<{ signature: string; deduped: boolean } | null>;
  status: SignStatus; error: string | null; reset: () => void;
};
export function useLaunchToken(): UseMutationResult<LaunchTokenResponse, ApiError, LaunchTokenRequest>;
export function useVestingList(role?: 'recipient'|'sender', mint?: string): UseQueryResult<VestingListItem[]>; // key ['vesting',user?.id,role,mint??null]; staleTime 30s
export function useWithdrawVesting(): { withdraw: (vestingId: string) => Promise<{signature:string;deduped:boolean}|null>; status: SignStatus; error: string | null; };
export function useCreateVesting(): UseMutationResult<VestingCreateResponse, ApiError, VestingCreateRequest>;
```

### a.5 SHARED components (foundation; in `composites/`)
```ts
// FundraiseProgress.tsx
export interface FundraiseProgressProps {
  raisedBaseUnits: string; thresholdBaseUnits: string; progressPct?: number;
  quoteMint?: string; quoteDecimals?: number; contributorCount?: number;
  status: 'DRAFT'|'ACTIVE'|'THRESHOLD_MET'|'FINALIZING'|'COMPLETED'|'FAILED'|'REFUNDED';
  graduatedAt?: number | null; compact?: boolean; style?: ViewStyle;
}
export function FundraiseProgress(p: FundraiseProgressProps): JSX.Element;

// FeeDisclosure.tsx   (SINGLE fee-copy source; replaces FeeDisclosureCard/FeeTaxDisclosure names)
export interface FeeDisclosureProps {
  variant?: 'trade' | 'launch' | 'vesting';   // default 'trade' — tunes copy
  display?: 'inline' | 'card' | 'expandable'; // default 'expandable'
  transferFeeBps?: number;                     // default MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS
  effectiveInAppBps?: number;                  // default MOMENTO_FEE.TARGET_IN_APP_BPS (100)
  rebateBps?: number;                          // derived = transferFeeBps - effectiveInAppBps if omitted
  inAppRebateBase?: string; rebateMint?: string; symbol?: string; style?: ViewStyle;
}
export function FeeDisclosure(p: FeeDisclosureProps): JSX.Element;

// VestingProgressBar.tsx
export interface VestingProgressBarProps { totalBase: string; withdrawnBase: string; claimableBase: string; height?: number; style?: ViewStyle; }
export function VestingProgressBar(p: VestingProgressBarProps): JSX.Element;

// PercentSlider.tsx  (STEPPER impl — no slider lib installed; same API)
export interface PercentSliderProps { label: string; value: number; min: number; max: number; step: number; suffix?: string; valueColor?: string; onChange: (v: number) => void; }
export function PercentSlider(p: PercentSliderProps): JSX.Element;

// FormField.tsx  (primitives/)
export interface FormFieldProps extends Omit<TextInputProps,'style'> { label: string; value: string; onChangeText: (t: string) => void; error?: string; affix?: string; counterMax?: number; }
export function FormField(p: FormFieldProps): JSX.Element;

// TokenStatRow.tsx (composites/)
export interface TokenStatRowProps { priceUsd: number; change24hPct?: number; marketCapUsd: number; }
export function TokenStatRow(p: TokenStatRowProps): JSX.Element;
```

### a.6 LAUNCH-owned signatures (P3B-launch)
```ts
// src/hooks/useLaunchWizard.tsx  (Context provider + hook, NOT in hooks/index barrel — local to launch)
export interface LaunchDraft { /* see D-launch §3.1 — basics/fees/fundraise/vesting slices */ }
export type LaunchStep = 'basics'|'fees'|'fundraise'|'vesting'|'review';
export function LaunchWizardProvider(p: { children: React.ReactNode }): JSX.Element;
export function useLaunchWizard(): { draft: LaunchDraft; patch: (p: Partial<LaunchDraft>) => void; errors: Record<string,string>; validateStep: (s: LaunchStep) => Record<string,string>; buildLaunchPayload: () => LaunchTokenRequest; reset: () => void; };
// Components (features/launch/): StepProgress({step,total}), AllocationSliders({value,onChange}), ReviewRow({label,value,onEdit?})
// Component (features/): LaunchTokenCta({ onPress })  — used by foundation's ProfileDashboard edit, so foundation pre-exports it; launch CREATES the file.
```

### a.7 TRADE-owned signatures (P3B-trade)
```ts
// features/TradePanel.tsx
export interface TradePanelProps { mint: string; initialSide: 'buy'|'sell'; }
export function TradePanel(p: TradePanelProps): JSX.Element;
// features/TradeStatusSheet.tsx
export interface TradeStatusSheetProps { visible: boolean; status: SignStatus; error: string | null; signature: string | null; symbol: string; onRetry: () => void; onClose: () => void; }
export function TradeStatusSheet(p: TradeStatusSheetProps): JSX.Element;
// features/RecentTradesList.tsx  { trades: TradeFeedItem[]; decimals: number; symbol: string; }
// features/TradeScreenSkeleton.tsx  {}
```

### a.8 VESTING-owned signatures (P3B-vesting)
```ts
// features/VestingScheduleCard.tsx
export interface VestingScheduleCardProps { schedule: VestingListItem; role: 'recipient'|'sender'; onWithdraw?: (s: VestingListItem) => void; }
// features/VestingWithdrawSheet.tsx
export interface VestingWithdrawSheetProps { visible: boolean; schedule: VestingListItem | null; onClose: () => void; }
// features/VestingSkeleton.tsx  { count?: number }
```

---

## (b) FILE MANIFEST — partitioned so concurrent tasks NEVER share a file

### b.0 Barrel-write rule
To keep barrels single-writer, **P3B-foundation owns and writes the full export lines** in
`hooks/index.ts`, `components/primitives/index.ts`, `components/composites/index.ts`,
`components/features/index.ts` — INCLUDING the export lines for the launch/trade/vesting NEW components
(those files are created by the screen tasks, but the export line is added by foundation up front). Screen
tasks therefore NEVER edit a barrel. This is intentional contention avoidance.

### b.1 P3B-foundation (build FIRST — owns all shared + contended files)
| File | CREATE/EDIT | Responsibility |
|---|---|---|
| `apps/mobile/src/utils/tokenAmount.ts` | CREATE | base-unit/USD/bps formatting (§a.1) |
| `apps/mobile/src/utils/solanaTx.ts` | CREATE | base64↔Uint8Array, connection, deserialize (§a.1) |
| `apps/mobile/src/utils/index.ts` | EDIT | re-export the two utils |
| `apps/mobile/src/services/tokenApi.ts` | CREATE | typed `apiService` wrappers (§c) |
| `apps/mobile/src/services/tokenApi.types.ts` | CREATE | ALL wire types (§a.2) — single types file |
| `apps/mobile/src/services/index.ts` | EDIT | re-export tokenApi |
| `apps/mobile/src/config/env.ts` | EDIT | add `FEES_FEED_ENABLED` (+ `HELIUS_RPC_URL` if referenced) |
| `apps/mobile/src/hooks/useClientSignSubmit.ts` | CREATE | shared sign primitive (§a.3) |
| `apps/mobile/src/hooks/useTokenDetail.ts` | CREATE | §a.4 |
| `apps/mobile/src/hooks/useTokenTrades.ts` | CREATE | §a.4 (gated) |
| `apps/mobile/src/hooks/useTokenFees.ts` | CREATE | §a.4 (gated) |
| `apps/mobile/src/hooks/useCreatorFees.ts` | CREATE | §a.4 (gated) |
| `apps/mobile/src/hooks/useTokenTradeQuote.ts` | CREATE | §a.4 |
| `apps/mobile/src/hooks/useSubmitTrade.ts` | CREATE | §a.4 (signOnly via useClientSignSubmit) |
| `apps/mobile/src/hooks/useLaunchToken.ts` | CREATE | §a.4 |
| `apps/mobile/src/hooks/useVestingList.ts` | CREATE | §a.4 |
| `apps/mobile/src/hooks/useWithdrawVesting.ts` | CREATE | §a.4 (signAndSend) |
| `apps/mobile/src/hooks/useCreateVesting.ts` | CREATE | §a.4 (signMode discriminator) |
| `apps/mobile/src/hooks/index.ts` | EDIT | export all new hooks (NOT useLaunchWizard — local to launch) |
| `apps/mobile/src/components/composites/FundraiseProgress.tsx` | CREATE | shared (§a.5) |
| `apps/mobile/src/components/composites/FeeDisclosure.tsx` | CREATE | shared, single fee copy (§a.5) |
| `apps/mobile/src/components/composites/VestingProgressBar.tsx` | CREATE | shared (§a.5) |
| `apps/mobile/src/components/composites/PercentSlider.tsx` | CREATE | stepper impl (§a.5) |
| `apps/mobile/src/components/composites/TokenStatRow.tsx` | CREATE | shared (§a.5) |
| `apps/mobile/src/components/primitives/FormField.tsx` | CREATE | shared form input (§a.5) |
| `apps/mobile/src/components/primitives/index.ts` | EDIT | export FormField |
| `apps/mobile/src/components/composites/index.ts` | EDIT | export the 5 composites above |
| `apps/mobile/src/components/features/index.ts` | EDIT | export ALL launch/trade/vesting feature components (pre-add lines; files created by screen tasks) |
| `apps/mobile/src/components/features/ProfileDashboard.tsx` | EDIT | add LaunchTokenCta entry (creator, no token → `/launch`) + "VESTING" row (→ `/vesting`); add `hasLaunchedToken?`,`tokenSymbol?`,`tokenMint?` props |
| `apps/mobile/app/(tabs)/profile.tsx` | EDIT | pass `hasLaunchedToken/tokenSymbol/tokenMint` from user profile to ProfileDashboard |
| `apps/mobile/app/creator/[id].tsx` | EDIT | replace `renderTokenTab()` placeholder: drop hardcoded `tokenData`/`chartData`/`ComingSoonModal`; render `TokenStatRow`+`FundraiseProgress`+real chart from `useTokenDetail(profile.tokenMint)`; BUY/SELL → `/token/[mint]/trade?side=...` |
| `apps/mobile/app/market.tsx` | EDIT | BUY/row press → `router.push('/token/'+mint)` (mint from creator); remove ComingSoon for tradeable tokens |
| `packages/shared/src/types.ts` | EDIT | add `tokenMint?: string; tokenId?: string` to `PublicCreator` (the one shared change; §2.2 SPEC) |

### b.2 P3B-launch (NEW files only; barrels untouched)
| File | CREATE | Responsibility |
|---|---|---|
| `apps/mobile/app/launch/_layout.tsx` | CREATE | Stack + `LaunchWizardProvider` + StepProgress header |
| `apps/mobile/app/launch/index.tsx` | CREATE | Step 1 basics (non-creator guard) |
| `apps/mobile/app/launch/fees.tsx` | CREATE | Step 2 fee & tax |
| `apps/mobile/app/launch/fundraise.tsx` | CREATE | Step 3 target + LP allocation |
| `apps/mobile/app/launch/vesting.tsx` | CREATE | Step 4 vesting (form-only) |
| `apps/mobile/app/launch/review.tsx` | CREATE | Step 5 review + LAUNCH |
| `apps/mobile/app/launch/result.tsx` | CREATE | Step 6 result + share + vesting hand-off |
| `apps/mobile/src/hooks/useLaunchWizard.tsx` | CREATE | wizard Context (§a.6; local — NOT in hooks barrel) |
| `apps/mobile/src/components/features/LaunchTokenCta.tsx` | CREATE | profile entry card (foundation pre-exports it) |
| `apps/mobile/src/components/features/launch/StepProgress.tsx` | CREATE | step bar |
| `apps/mobile/src/components/features/launch/AllocationSliders.tsx` | CREATE | 4× PercentSlider + bar + reset |
| `apps/mobile/src/components/features/launch/ReviewRow.tsx` | CREATE | review label/value row |

### b.3 P3B-trade (NEW files only; barrels untouched)
| File | CREATE | Responsibility |
|---|---|---|
| `apps/mobile/app/token/[mint].tsx` | CREATE | token DETAIL screen |
| `apps/mobile/app/token/[mint]/trade.tsx` | CREATE | full-screen TRADE (`?side=`) |
| `apps/mobile/src/components/features/TradePanel.tsx` | CREATE | buy/sell form (foundation pre-exports) |
| `apps/mobile/src/components/features/TradeStatusSheet.tsx` | CREATE | sign→confirm overlay |
| `apps/mobile/src/components/features/RecentTradesList.tsx` | CREATE | recent trades rows |
| `apps/mobile/src/components/features/TradeScreenSkeleton.tsx` | CREATE | detail/trade skeleton |

### b.4 P3B-vesting (NEW files only; barrels untouched)
| File | CREATE | Responsibility |
|---|---|---|
| `apps/mobile/app/vesting.tsx` | CREATE | vesting LIST + role toggle |
| `apps/mobile/app/vesting/create.tsx` | CREATE (optional) | creator create vesting/lock (uses useCreateVesting) |
| `apps/mobile/src/components/features/VestingScheduleCard.tsx` | CREATE | schedule card (foundation pre-exports) |
| `apps/mobile/src/components/features/VestingWithdrawSheet.tsx` | CREATE | withdraw sheet (signAndSend) |
| `apps/mobile/src/components/features/VestingSkeleton.tsx` | CREATE | loading skeleton |

> Note: `features/launch/` is a new subdir owned solely by P3B-launch (no contention). All other new
> feature files sit directly in `features/`; their barrel export lines are pre-added by foundation (§b.0).

---

## (c) API METHODS — `src/services/tokenApi.ts` (exact, endpoint per method)
```ts
import { apiService } from '@/services/api';
import type * as P3 from './tokenApi.types';
export const getTokenDetail  = (mint: string)                                  => apiService.get<P3.TokenDetailResponse>(`/tokens/${mint}`);                         // d.2
export const launchToken     = (body: P3.LaunchTokenRequest)                   => apiService.post<P3.LaunchTokenResponse>('/tokens/launch', body);                  // d.1
export const buildTrade      = (mint: string, side: 'buy'|'sell', b: P3.TradeOrderRequest)  => apiService.post<P3.TradeBuildResponse>(`/tokens/${mint}/${side}`, b);        // d.3
export const submitTrade     = (mint: string, side: 'buy'|'sell', b: P3.TradeSubmitRequest) => apiService.post<P3.TradeSubmitResponse>(`/tokens/${mint}/${side}/submit`, b); // d.4
export const createVesting   = (body: P3.VestingCreateRequest)                 => apiService.post<P3.VestingCreateResponse>('/vesting/create', body);               // d.7
export const listVesting     = (p?: { role?: 'recipient'|'sender'; mint?: string }) => apiService.get<P3.VestingListItem[]>('/vesting/list', p);                    // d.8
export const withdrawVesting = (id: string)                                    => apiService.post<P3.VestingWithdrawResponse>(`/vesting/${id}/withdraw`, {});        // d.9
export const getTokenTrades  = (mint: string, p?: { limit?: number; cursor?: string }) => apiService.get<P3.TradeFeedItem[]>(`/tokens/${mint}/trades`, p);          // gated §2.1
export const getTokenFees    = (mint: string)                                  => apiService.get<P3.TokenFeesResponse>(`/tokens/${mint}/fees`);                      // gated
export const getCreatorFees  = (creatorId: string)                             => apiService.get<P3.CreatorFeesResponse>(`/creators/${creatorId}/fees`);            // gated
```

---

## (d) Design tokens / primitives to REUSE (no new ones)
- Tokens: `COLORS`, `SPACING`, `RADII`, `SHADOWS` from `@/styles/theme`; `TYPOGRAPHY` +
  `FONT_FAMILY_DISPLAY/BOLD` from `@/styles/typography` (§0 SPEC).
- Primitives: `Text`, `Button` (loading+disabled+fullWidth+size), `Card`, `Avatar`, `MediaImage`, `Spacer`,
  `Skeleton`/`SkeletonText`, `LoadingView`, `PillButton`, `+ FormField` (new).
- Composites: `PillTabs`, `StatsCard` (`variant:'inline'|'card'`, `valueColor`), `BuySellPills`
  (`onBuy/onSell/disabled/style`), `PerformanceChart`, `TokenSwapWidget` (layout ref for TradePanel),
  `+ FundraiseProgress / FeeDisclosure / VestingProgressBar / PercentSlider / TokenStatRow` (new).
- Features to mirror: `SwapModal` (sheet shell, balance+MAX, status screen, errorBanner, tx logging),
  `DisclaimerModal` (warning section + checkbox), `WalletSkeleton`/`ChartSkeleton` (skeletons),
  `FundWalletModal` (offer on wallet-not-ready/insufficient).
- Hooks to follow: `useSwap` (sign pattern source), `useCreatePost` (mutation+invalidate),
  `useUpload` (image pick+upload), `useWalletBalance`, `useAuth` (`walletAddress`,`getWalletProvider`).
- Icons: `@expo/vector-icons` Ionicons (`chevron-back`,`checkmark-circle`,`alert-circle`,`sparkles`,
  `shield-checkmark`,`time-outline`,`copy-outline`). Clipboard via `expo-clipboard`. NO `@react-native-community/slider`.

---

## (e) BUILD ORDER
1. **P3B-foundation** (everything in §b.1) — MUST complete first. Provides utils, types, API wrappers,
   `useClientSignSubmit`, all hooks, all SHARED components, all barrel exports (incl. screen-task component
   export lines), and all existing-screen entry-point edits + the one `@momento/shared` change.
2. Then, in PARALLEL (no shared files):
   - **P3B-launch** (§b.2)
   - **P3B-trade** (§b.3)
   - **P3B-vesting** (§b.4)

Foundation pre-creating barrel export lines for not-yet-created files means the barrels reference files that
appear in step 2; that is fine within one repo build and guarantees barrels stay single-writer. If a screen
task slips, its barrel line points at a missing module only until that task lands.

---

## (f) UNRESOLVED — needs user/backend confirmation
1. **`creator → mint` shared-type change.** SPEC §2.2 decides to add `tokenMint?`/`tokenId?` to
   `PublicCreator` + `/creators/[id]` response (backend). Confirm backend will ship the response field;
   else `creator/[id]` and `market` deep-links degrade to the standalone `/token/[mint]` route only.
2. **`GET /tokens/[mint]/{trades,fees}` + `/creators/[id]/fees` existence.** Not in binding §d. Hooks are
   built but gated by `ENV.FEES_FEED_ENABLED` (default OFF) → confirm/file these read routes; chart + recent
   trades + fee-earnings render empty until then. No hard dependency.
3. **Privy `signTransaction` availability.** §d.4 requires client-signed base64 → trades use `signOnly`.
   Verify the embedded Privy Solana provider exposes `signTransaction` (not only `signAndSendTransaction`)
   on device. Isolated to `useClientSignSubmit`. (`vesting`/`launch-alt` use `signAndSend`, already proven by
   `useSwap`.)
4. **`VestingListItem.decimals`/`kind`.** §d.8 may omit them. Defaults 9 / `'vesting'`; request backend add
   them to the list row to remove the `TODO(contract)` assumption.
