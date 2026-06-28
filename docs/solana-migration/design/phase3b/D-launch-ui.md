# D-launch-ui — Creator Token-Launch Wizard (Phase 3B Mobile)

> **Status:** IMPLEMENTATION-READY. Expo RN (`apps/mobile`). Maps to `POST /api/tokens/launch`
> (`launchTokenSchema`, CONTRACTS-P3A §d.1 / §e). **Launch is a SERVER-signed platform action** — the
> mobile app POSTs the form, the API signs + lands the DBC config + pool, and returns landed signatures.
> NO client signing for launch (unlike trade/vesting). Build/loading/error/empty/disabled states are
> mandatory and specified per screen. Design tokens are exact (`apps/mobile/src/styles`).
>
> Sibling designers MUST read **§9 Cross-cutting decisions** before building trade/vesting/fundraise UI —
> several files (`useUpload`, money formatters, the data-layer types, the launch entry point) are shared.

---

## 1. Where it hangs off the IA (entry points — EXISTING files to edit)

Launch is creator-only. There is no Figma screen for it; we extend the **creator action row** that already
exists in `ProfileDashboard` ("EDIT PROFILE / NEW POST / ACCOUNT" `PillTabs`).

### 1.1 `apps/mobile/src/components/features/ProfileDashboard.tsx` — EDIT (primary entry)
- The creator header currently renders 3 action pills via `PillTabs` (`handleCreatorAction`). The pill row
  is the canonical creator-action surface; adding a 4th pill makes it cramped on narrow devices, so instead
  add a dedicated **"LAUNCH TOKEN" CTA card** below the stats row, gated on "creator has no token yet".
- New prop: `hasLaunchedToken?: boolean` (default `false`) and `tokenSymbol?: string`.
  - If `!hasLaunchedToken`: render `LaunchTokenCta` (new feature component, §6.5) → `router.push('/launch')`.
  - If `hasLaunchedToken`: render a compact "MANAGE $SYMBOL" row → `router.push('/creator/[id]')` TOKEN tab
    (owned by D-trade; just navigate, do not build here).
- `handleCreatorAction`: leave the 3 existing pills unchanged. (One-token-per-creator is enforced
  server-side with 409; the CTA gate is a UX nicety, not the source of truth.)

### 1.2 `apps/mobile/app/(tabs)/profile.tsx` — EDIT (wire the new prop)
- Compute `hasLaunchedToken` from the user profile. The profile payload should expose the creator's token
  (see §9.4 — coordinate with whoever owns `useUserProfile`/`usePublicProfile`). Pass
  `hasLaunchedToken={!!user?.creatorToken?.mintAddress}` and `tokenSymbol={user?.creatorToken?.symbol}`
  into both `ProfileDashboard` render sites.
- No router file to edit — Expo Router is file-based; the new files under `app/launch/` auto-register.

---

## 2. Route map (NEW files — file-based routing)

All wizard steps live under a **stack group** so they share a header + a single in-memory form context and
animate as a push stack. Expo Router nested layout.

```
apps/mobile/app/launch/_layout.tsx        Stack layout + <LaunchWizardProvider> + step progress header
apps/mobile/app/launch/index.tsx          Step 1 — TOKEN BASICS
apps/mobile/app/launch/fees.tsx           Step 2 — FEE & TAX
apps/mobile/app/launch/fundraise.tsx      Step 3 — FUNDRAISE THRESHOLD & LP SPLIT
apps/mobile/app/launch/vesting.tsx        Step 4 — TEAM VESTING (optional)
apps/mobile/app/launch/review.tsx         Step 5 — REVIEW & CONFIRM (fires POST)
apps/mobile/app/launch/result.tsx         Step 6 — RESULT (mint/pool + share)
```

Navigation is linear: each step's footer "CONTINUE" validates its slice then `router.push` to the next.
"BACK" uses the stack. `result.tsx` resets the stack (`router.dismissAll()` then `router.replace`) so the
back button can't re-fire a submit. Guard: `index.tsx` redirects non-creators to `/profile` on mount.

---

## 3. Form state + client-side validation (mirrors `launchTokenSchema`)

### 3.1 `apps/mobile/src/hooks/useLaunchWizard.tsx` — NEW (Context + provider, exported from `hooks/index.ts`)

A React Context holding the whole draft + per-field validators. Steps read/write via
`const { draft, patch, errors, validateStep } = useLaunchWizard()`. Persist nothing to disk (a draft token
launch is ephemeral; abandoning the flow discards it).

```ts
export interface LaunchDraft {
  // Step 1 — basics
  name: string;                 // 1..32
  symbol: string;               // 1..10, auto-uppercased on change
  description: string;          // 0..2000
  imageUri: string | null;      // local picker URI (pre-upload)
  imageUrl: string | null;      // populated after useUpload → sent to API
  totalSupply: string;          // WHOLE tokens, /^[1-9]\d*$/, default "1000000000"
  decimals: number;             // 6..9, default 9

  // Step 2 — fee & tax
  transferFeeBps: number;       // 300..500, default 400
  feeSplit: { creatorBps: number; partnerBps: number }; // sum 10000, default 5000/5000

  // Step 3 — fundraise
  fundraise: {
    targetUsd: number;          // > 0
    initialMarketCapUsd: number;// default 100 (MOMENTO_LAUNCH.DEFAULT_INITIAL_MARKET_CAP_USD)
    partnerLockedLpPct: number; // 0..100, default 50
    partnerLpPct: number;       // 0..100, default 0
    creatorLockedLpPct: number; // 0..100, default 50
    creatorLpPct: number;       // 0..100, default 0
  };                            // four pcts sum to EXACTLY 100

  // Step 4 — vesting (optional; omitted from payload entirely if disabled)
  vestingEnabled: boolean;
  vesting?: {
    kind: 'vesting' | 'lock';
    recipient: string;          // base58 wallet
    amountWhole: string;        // WHOLE tokens; converted to base units at submit
    startAt: number; cliffAt: number; endAt: number; unlockEvery: number;
    cliffAmountWhole: string;
  };
}

export type LaunchStep = 'basics' | 'fees' | 'fundraise' | 'vesting' | 'review';
```

Defaults pulled from `@momento/shared` `MOMENTO_LAUNCH` constants (do NOT hardcode 1000000000/9/50/100 —
import them) and `MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS` for `transferFeeBps`.

### 3.2 Validation rules (exact, mirror Zod — fail BEFORE the network)

`validateStep(step): Record<string,string>` returns field→message; CONTINUE is disabled while non-empty.

| Step | Field | Rule | Message |
|---|---|---|---|
| basics | name | trim length 1..32 | "Name is required" / "Max 32 characters" |
| basics | symbol | `/^[A-Z0-9]{1,10}$/` after uppercase | "Ticker required" / "Max 10, letters/numbers" |
| basics | description | length ≤ 2000 | "Max 2000 characters" |
| basics | imageUrl | optional; if `imageUri` set, MUST finish upload before continue | "Wait for image upload" |
| basics | totalSupply | `/^[1-9]\d*$/` | "Whole number, no leading zero" |
| basics | decimals | int 6..9 | "Decimals 6–9" |
| fees | transferFeeBps | int 300..500 | "Transfer fee 3%–5%" |
| fees | feeSplit | creatorBps+partnerBps===10000 | "Split must total 100%" |
| fundraise | targetUsd | number > 0 | "Enter a fundraise target" |
| fundraise | LP pcts | 4 ints each 0..100, **sum===100** | "LP allocation must total 100%" |
| vesting (if enabled) | recipient | non-empty base58 (len 32..44) | "Enter a recipient wallet" |
| vesting | amountWhole | `/^[1-9]\d*$/`, ≤ totalSupply | "Amount exceeds supply" |
| vesting | times | cliffAt≥startAt; endAt>cliffAt; (endAt−cliffAt)%unlockEvery===0 | mirrors `vestingCreateSchema` refines |

UI works in **bps via percent sliders** (e.g. transfer fee shown as 3.0%–5.0%; fee split as a single
"CREATOR %" with partner = 100−creator). Convert to bps only in `buildLaunchPayload`.

### 3.3 `buildLaunchPayload(draft): LaunchTokenRequest` (pure, in the hook file)
Produces the §4.1 request body. Drops `vesting` key entirely when `!vestingEnabled`. Note: `launchTokenSchema`
itself does NOT include vesting — team vesting is a **separate `POST /api/vesting/create` call chained after
launch succeeds** (see §5.3). The wizard collects vesting in step 4 but submits it in two phases.

---

## 4. Data layer (NEW — API client methods, hook, types)

### 4.1 `apps/mobile/src/services/launchApi.ts` — NEW (thin wrappers over `apiService`)
Reuse the singleton `apiService` (it already unwraps `{success,data}` and attaches the bearer). Define wire
types locally (mirror CONTRACTS §d.1) — do not depend on `packages/shared` adding them.

```ts
import { apiService } from './api';

export interface LaunchTokenRequest {
  name: string; symbol: string; description?: string; imageUrl?: string;
  totalSupply: string; decimals: number; transferFeeBps: number;
  feeSplit: { creatorBps: number; partnerBps: number };
  fundraise: {
    targetUsd: number; initialMarketCapUsd?: number;
    partnerLockedLpPct: number; partnerLpPct: number;
    creatorLockedLpPct: number; creatorLpPct: number;
  };
}
// Server-signed default (§d.1 main path)
export interface LaunchTokenResult {
  tokenId: string; mintAddress: string; dbcConfigKey: string; dbcPoolAddress: string;
  poolType: 'METEORA_DBC'; status: 'ACTIVE' | 'DEPLOYING';
  configSignature: string; poolSignature: string;
}
// Alt path (creator-as-poolCreator, §d.1) — handle defensively even if unused in 3B
export interface LaunchDeployingResult { transaction: string; tokenId: string; status: 'DEPLOYING'; }
export type LaunchResponse = LaunchTokenResult | LaunchDeployingResult;

export function launchToken(body: LaunchTokenRequest) {
  return apiService.post<LaunchResponse>('/tokens/launch', body);
}
```

### 4.2 `apps/mobile/src/hooks/useLaunchToken.ts` — NEW (React Query mutation; exported from `hooks/index.ts`)
Follows `useCreatePost` exactly (mutation + invalidate). NOT `useSwap` — launch is server-signed, no Privy.

```ts
export function useLaunchToken() {
  const qc = useQueryClient();
  return useMutation<LaunchResponse, ApiError, LaunchTokenRequest>({
    mutationFn: (body) => launchToken(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['userProfile'] });
      qc.invalidateQueries({ queryKey: ['creator'] });
    },
  });
}
```

Error mapping (`ApiError.status` from §d.1): map to friendly copy on the review screen, do NOT toast-and-lose.
`409` → "You already have a token." (terminal, route to manage); `402` → "Platform wallet needs funding —
try again shortly."; `400` → "Launch simulation failed. Adjust parameters and retry."; `202`
(status `DEPLOYING`) → treat as **success-pending** (route to result with a deploying banner); `200` with a
prior result (DUPLICATE) → success. Anything else → generic retry.

### 4.3 Image upload — REUSE `useUpload` (`apps/mobile/src/hooks/useUpload.ts`)
Step 1 picks via `expo-image-picker` (copy `create-post.tsx` permission flow), then `uploadFromUri` →
`imageUrl`. Show inline spinner on the upload card while `isUploading`; block CONTINUE until done (§3.2).

---

## 5. Screen-by-screen spec (layout + states + tokens)

Global frame for every step: `SafeAreaView edges={['top']}` · `COLORS.background` (#000000) ·
`ScrollView` + `KeyboardAvoidingView` (copy `create-post.tsx`). Shared chrome rendered by `_layout.tsx`:
back chevron (`Ionicons "chevron-back"` 26 `COLORS.textPrimary`), centered step title (`TYPOGRAPHY.h3`,
uppercase), and a **StepProgress** bar (§6.1). Footer is a sticky CTA (`Button` primary, `fullWidth`,
`size="lg"`, label "CONTINUE") above the safe-area inset, with a hairline top border `COLORS.border`.

### 5.1 Step 1 — TOKEN BASICS (`index.tsx`)
- **Image card** (top): gradient `LinearGradient [COLORS.surface, COLORS.surfaceElevated]`, `RADII.md`,
  1px `COLORS.border`, square ~160px, centered cloud icon + "ADD TOKEN IMAGE" (`TYPOGRAPHY.label`,
  `COLORS.textSecondary`). Mirrors the edit-profile upload card. Shows preview `MediaImage` once picked;
  spinner overlay while uploading.
- **Fields** (use a shared `FormField` wrapper, §6.2 — label + `TextInput` + error line):
  - NAME — single line, `maxLength={32}`.
  - TICKER — single line, `autoCapitalize="characters"`, `maxLength={10}`, render with a leading "$"
    affix (display only). Live-uppercase via `patch`.
  - DESCRIPTION — multiline, `maxLength={2000}`, char counter bottom-right (`TYPOGRAPHY.caption`,
    `COLORS.textTertiary`) like `create-post.tsx`.
  - SUPPLY & DECIMALS in a 2-col row (`SPACING.md` gap): SUPPLY numeric `TextInput`
    (`keyboardType="number-pad"`, formatted with thousands separators for display, raw stored);
    DECIMALS a small `PillTabs`/stepper for 6/7/8/9 (default 9).
- States: errors render under each field in `COLORS.error`. CONTINUE disabled until step valid.

### 5.2 Step 2 — FEE & TAX (`fees.tsx`)
This step is **half form, half disclosure** — it must explain the transfer fee + the in-app rebate so the
creator understands what they're imposing on holders.
- **TRANSFER FEE** card: a labelled slider (3.0%–5.0%, 0.25% steps → bps 300..500). Big current value in
  `COLORS.primary` (`TYPOGRAPHY.monoLarge`). Sub-caption: "Charged on every transfer of your token. Momento
  refunds ~1% of it back to in-app traders as a rebate." (See §6.4 `FeeDisclosureCard` — the canonical
  1%-in-app-vs-higher-elsewhere + rebate copy; SHARED with the trade screen — coordinate §9.3.)
- **TRADING FEE SPLIT** card: single "YOUR SHARE" slider 0–100% (creator), with a live readout
  "YOU 50% · MOMENTO 50%" (partner = platform = 100−creator). Stored as `feeSplit.{creatorBps,partnerBps}`.
- **Worked example** block (`COLORS.surface` card): "On a $100 trade → ~$X transfer fee → in-app buyers get
  ~$1 back." Compute from current bps for tangibility.
- States: sliders are always valid within range; the only blocking error is split≠100 (impossible with the
  single-slider model, but `validateStep` still checks it as the source of truth).

### 5.3 Step 3 — FUNDRAISE THRESHOLD & LP SPLIT (`fundraise.tsx`)
- **TARGET** card: USD `TextInput` (`keyboardType="decimal-pad"`, "$" affix) → `fundraise.targetUsd`.
  Caption: "When buys reach this raised amount, your token graduates to a permanent liquidity pool."
- **INITIAL MARKET CAP** (advanced, collapsible — default collapsed showing the
  `MOMENTO_LAUNCH.DEFAULT_INITIAL_MARKET_CAP_USD` value).
- **LP ALLOCATION** — the configurable %LP / %treasury / %creator-tokens framing. Render four labelled
  sliders backed by `AllocationSliders` (§6.3):
  - PARTNER LOCKED LP (default 50), PARTNER LP (0), CREATOR LOCKED LP (default 50), CREATOR LP (0).
  - A persistent **sum readout** chip: "TOTAL 100%" turns `COLORS.error` when ≠100. A horizontal stacked
    bar visualizes the four shares (segments colored primary / primary@60% / textSecondary / textTertiary).
  - "RESET TO DEFAULT" text button (`COLORS.primary`) restores 50/0/50/0.
- States: CONTINUE blocked until sum===100 AND targetUsd>0. Inline error under the bar.

### 5.4 Step 4 — TEAM VESTING (optional) (`vesting.tsx`)
- **Top toggle**: "ADD TEAM VESTING?" switch. OFF (default) → rest of form is hidden, CONTINUE always
  enabled (vesting omitted). ON → reveal fields.
- KIND segmented `PillTabs` (VESTING / LOCK). RECIPIENT wallet `TextInput` (mono). AMOUNT (whole tokens,
  numeric, with "of {totalSupply} supply" helper). DATES: START / CLIFF / END via a date-picker row
  (store unix seconds); UNLOCK EVERY as a `PillTabs` preset (DAILY 86400 / WEEKLY 604800 / MONTHLY 2592000)
  → `unlockEvery`. CLIFF AMOUNT optional.
- Disclosure: "Vesting is created as a separate transaction after your token launches. You'll be asked to
  approve it." (This is the only step whose action is client-signed — see §9.2; the wizard does NOT build it
  here, it hands the collected `vesting` slice to the result step's chained call, or punts to the dedicated
  vesting screen owned by D-vesting — see §9.5 for the agreed boundary.)
- States: when ON, validate per §3.2; mirror `vestingCreateSchema` refines exactly so the later create call
  can't 400.

### 5.5 Step 5 — REVIEW & CONFIRM (`review.tsx`)
- Read-only summary grouped into sections (BASICS / FEES / FUNDRAISE / VESTING), each a `COLORS.surface`
  card with label/value rows (`TYPOGRAPHY.label` left `COLORS.textSecondary`, value right
  `COLORS.textPrimary`). An "EDIT" affordance per section → `router.push` back to that step.
- **Token image** thumbnail + $TICKER + name header at top (like the edit-profile name+dot treatment;
  reuse the 8px green verified dot pattern only if the creator is verified).
- **Cost/permanence notice** card (`COLORS.warning` accent border, like `DisclaimerModal.warningSection`):
  "Launching is irreversible. Fees and supply are fixed at launch." Plus a required checkbox
  "I understand the parameters are permanent" (copy the checkbox pattern from `DisclaimerModal`).
- Footer CTA changes to **"LAUNCH TOKEN"** (`Button` primary). On press → `useLaunchToken().mutate`.
- **States:**
  - *loading*: button shows `ActivityIndicator` (Button `loading` prop); whole form disabled; a
    full-width `LaunchProgress` strip under the header cycles "DEPLOYING CONFIG → CREATING POOL → DONE"
    (purely cosmetic timeline, server is atomic — keep honest copy "This can take ~30s").
  - *error*: inline error card above the footer with the mapped message (§4.2) + "TRY AGAIN" (re-enable
    button). 409 shows a terminal state with "GO TO MY TOKEN".
  - *success / 202*: `router.dismissAll()` → `router.replace({ pathname:'/launch/result', params:{...} })`.

### 5.6 Step 6 — RESULT (`result.tsx`)
- Receives `tokenId, mintAddress, dbcPoolAddress, symbol, status` via route params.
- **Success hero**: big green check (`Ionicons "checkmark-circle"` `COLORS.primary`), "$SYMBOL IS LIVE"
  (`TYPOGRAPHY.h1`), name subtitle. If `status==='DEPLOYING'`, swap to an amber "DEPLOYING…" hero +
  "We'll notify you when it's live" (poll `GET /api/tokens/[mint]` via D-trade's `useTokenDetail` if
  available, else show static + a manual refresh).
- **Detail rows**: MINT and POOL addresses (truncated mono, tap-to-copy via `expo-clipboard`, toast
  "Copied"). Link "VIEW ON EXPLORER" (Solscan) via `Linking`.
- **Primary CTAs**: "VIEW TOKEN" → `/creator/[id]` TOKEN tab (D-trade); "SHARE" → RN `Share.share` with a
  deep link + "$SYMBOL just launched on Momento". Secondary: "DONE" → `router.replace('/(tabs)/profile')`.
- If a `vesting` slice was collected (§5.4) and the dedicated vesting create is in-scope here, show a
  "SET UP VESTING" CTA → hand off to D-vesting's create flow with the slice prefilled (see §9.5).

---

## 6. New components (apps/mobile/src/components)

| Component | File | Props | Notes |
|---|---|---|---|
| `StepProgress` | `features/launch/StepProgress.tsx` | `{ step: number; total: number }` | Thin segmented bar; filled segs `COLORS.primary`, empty `COLORS.border`, `RADII.full`, height 3. |
| `FormField` | `primitives/FormField.tsx` | `{ label; value; onChangeText; error?; ...TextInputProps }` | label `TYPOGRAPHY.label`; input on `COLORS.surface`, `RADII.md`, 1px border (→`COLORS.error` when error), `COLORS.textPrimary` text, `COLORS.textTertiary` placeholder; error line below. Reusable across ALL P3B forms (§9.1). |
| `PercentSlider` | `composites/PercentSlider.tsx` | `{ label; value; min; max; step; suffix?; onChange; valueColor? }` | Wraps `@react-native-community/slider` (verify dep §9.6); big mono value readout. |
| `AllocationSliders` | `features/launch/AllocationSliders.tsx` | `{ value: {4 pcts}; onChange; }` | 4 `PercentSlider`s + stacked-bar + TOTAL chip + reset. |
| `FeeDisclosureCard` | `features/FeeDisclosureCard.tsx` | `{ transferFeeBps; effectiveInAppBps?; variant?: 'launch'\|'trade' }` | **SHARED with trade screen** (§9.3). Canonical ~1%-in-app vs higher-elsewhere + rebate copy. |
| `LaunchTokenCta` | `features/LaunchTokenCta.tsx` | `{ onPress }` | The profile entry card (§1.1). Sparkle icon + "LAUNCH YOUR TOKEN" + subcopy, primary border like `creatorCta`. |
| `ReviewRow` | `features/launch/ReviewRow.tsx` | `{ label; value; onEdit? }` | label/value row for §5.5. |

Export new primitives/composites via the respective barrel `index.ts` (`primitives/index.ts`,
`composites/index.ts`, `features/index.ts`).

---

## 7. Money / number formatting

- The wizard collects `totalSupply` and vesting `amount` as **WHOLE tokens** (the API's `totalSupply` is
  whole; vesting `amountBase` is base units → multiply by `10**decimals` at submit using `BigInt` string
  math, NOT float). Add `wholeToBaseUnits(whole: string, decimals: number): string` to a shared
  `src/utils/tokenAmount.ts` (NEW; see §9.1 — also needed by trade/vesting for display).
- Display: thousands separators for supply; USD via `Intl.NumberFormat` or the existing
  `formatNumber`/currency helpers in `src/utils/formatters.ts` (check what's there before adding).

---

## 8. States checklist (every screen)
- **Loading**: review submit (button spinner + disabled form + progress strip); image upload (card spinner).
- **Error**: per-field inline (validation) + review-level mapped API error card with retry.
- **Empty/initial**: step 1 image card empty state; vesting step disabled state (toggle OFF).
- **Disabled**: CONTINUE/LAUNCH disabled whenever `validateStep` non-empty or a mutation is in-flight.
- **Terminal**: 409 already-has-token → manage CTA; success → result screen (back-safe via `dismissAll`).
- **Accessibility**: all sliders have `accessibilityLabel`+value; CTAs `accessibilityRole="button"`;
  contrast already satisfied by tokens.

---

## 9. CROSS-CUTTING DECISIONS (other P3B designers MUST align)

1. **Shared `FormField` + `tokenAmount` utils.** I'm introducing `primitives/FormField.tsx` and
   `src/utils/tokenAmount.ts` (`wholeToBaseUnits`/`baseUnitsToWhole`). Trade (amount inputs) and vesting
   (amount/recipient) MUST reuse both rather than re-rolling inputs/BigInt math. First to land owns them;
   others import.
2. **Launch = server-signed; Trade & Vesting = client-signed.** Launch uses a plain React Query mutation
   (`useLaunchToken`, no Privy). Trade/vesting MUST follow `useSwap`'s `getWalletProvider()` →
   `signAndSendTransaction` (build→sign→submit). Do not copy `useLaunchToken` for those.
3. **`FeeDisclosureCard` is shared.** The ~1%-in-app-vs-higher-elsewhere + rebate explanation lives in ONE
   component (`features/FeeDisclosureCard.tsx`) consumed by BOTH this wizard (step 2, `variant="launch"`)
   and the trade screen (`variant="trade"`). Whoever builds the trade screen and I must agree the copy +
   props once; do not duplicate.
4. **Profile payload must expose the creator's token.** Entry-point gating (§1) needs
   `user.creatorToken?.{mintAddress,symbol}` on the profile object. Whoever owns `useUserProfile` /
   `usePublicProfile` / the `/users/me` + `/creators/[id]` mobile types must add it. Until then the CTA can
   fall back to always-shown (server 409 is the real guard).
5. **Vesting handoff boundary.** The wizard COLLECTS team vesting (step 4) but the actual
   `POST /api/vesting/create` (client-signed, two-phase `signMode`) is owned by **D-vesting**. Agreed
   boundary: launch wizard passes the validated `vesting` slice (via route params or a shared store) to the
   D-vesting create flow, prefilled, reachable from the result screen. D-vesting owns the build/sign/submit
   + the `vesting.tsx` self-submit logic. The launch `vesting.tsx` step is form-only.
6. **Dependency check (NO install here — flag only).** `PercentSlider` needs a slider lib
   (`@react-native-community/slider`). Verify it's already a dependency; if not, the foundation/PM must add
   it. Fallback if unavailable: stepper buttons (−/+) instead of a slider — same `PercentSlider` API.

---

## 10. File summary (NEW unless noted)
- Routes: `app/launch/_layout.tsx`, `index.tsx`, `fees.tsx`, `fundraise.tsx`, `vesting.tsx`, `review.tsx`,
  `result.tsx`.
- Hooks: `src/hooks/useLaunchWizard.tsx`, `src/hooks/useLaunchToken.ts` (+ exports in `hooks/index.ts`).
- Service: `src/services/launchApi.ts`.
- Utils: `src/utils/tokenAmount.ts` (shared).
- Components: `primitives/FormField.tsx`, `composites/PercentSlider.tsx`,
  `features/FeeDisclosureCard.tsx` (shared), `features/LaunchTokenCta.tsx`,
  `features/launch/{StepProgress,AllocationSliders,ReviewRow}.tsx` (+ barrel exports).
- **EDIT (entry points):** `src/components/features/ProfileDashboard.tsx`, `app/(tabs)/profile.tsx`.
</content>
</invoke>
