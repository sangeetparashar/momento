# Hardening audit — schema / config / constants / validation

Scope (focus dimension): `apps/api/prisma/schema.prisma` + `prisma/migrations/*`,
`packages/shared/src/{types,constants}.ts`, `apps/api/lib/validation.ts`.
Lens: schema↔migration consistency, index/unique/onDelete correctness, enum usage,
constants (USDC mint network correctness, program ids), Zod bounds/`.loose`, env-flag
defaults, and any model field the financial code needs but is missing.

Cross-referenced against the prior phase-2/3 REVIEW docs and the other hardening
audits (financial-math, vesting, ingestion-data, launch-graduation, signing-tx,
api-authz) to avoid re-reporting. Spikes consulted as SDK/devnet ground truth.

---

## P0 — constants: `MOMENTO_FEE.USDC_MINT` is hardcoded MAINNET USDC and is written as the quote/rebate mint on every launch, but the on-chain economy defaults to DEVNET → the whole launch/trade/fee path references a mint that does not exist on the deploy cluster

**File:** `packages/shared/src/constants.ts:29` (`USDC_MINT: 'EPjFWdd5…Dt1v'`), consumed at
`apps/api/lib/launch.ts:607,618,624,671`, `apps/api/lib/trade.ts:274,283,1086,1116`,
`apps/api/lib/fee-claim.ts:126,692,972-973`, `apps/api/app/api/cron/fee-claim/route.ts:137-138`.

`MOMENTO_FEE.USDC_MINT` is the **mainnet** Circle USDC mint. `lib/solana/connection.ts:20`
defaults `getNetwork()` to `devnet`, i.e. the on-chain economy runs on devnet unless
`SOLANA_NETWORK=mainnet-beta`. On devnet the mainnet USDC mint **does not exist** — this is
stated verbatim in the spikes (ground truth): `scripts/spikes/README.md:49` ("mainnet `EPjFW…`
does NOT exist on devnet") and `spike-b-meteora-dbc.ts:195-197`, which use devnet USDC
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

Impact: `launch.ts` persists this mainnet string into `CreatorToken.quoteMint`,
`TokenFeeConfig.rebateMint`, and `TokenFundraise.quoteMint`, and passes it as
`ctx.quoteMint = new PublicKey(MOMENTO_FEE.USDC_MINT)` into the DBC `createConfig`/`createPool`
builders. On devnet that pool's quote vault / quote-leg ATAs reference a non-existent mint, so
the DBC launch flow that the spike proved with the *devnet* mint cannot work with the persisted
*mainnet* mint. Downstream, `fee-claim.ts:126` and `:973` treat `mint === MOMENTO_FEE.USDC_MINT`
as the "known classic USDC" fast-path — it matches the persisted string but derives an ATA for a
mint that isn't on the cluster.

The correct pattern already exists elsewhere in the repo and was simply not applied here:
`apps/api/app/api/wallet/send/route.ts:22-24` switches `USDC_MINT` on `SOLANA_NETWORK`
(devnet `4zMMC9…` vs mainnet `EPjFW…`). The launch/trade/fee-claim economy uses the
network-blind constant instead.

This is **not** one of the two known devnet blockers — it is fully fixable offline.

**Fix (schema-shared owns the constant):** Replace the single mainnet literal with a
network-aware resolver, mirroring `wallet/send`:
```ts
// constants.ts
export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET  = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export function getUsdcMint(): string {
  if (process.env.USDC_MINT) return process.env.USDC_MINT; // explicit override
  return process.env.SOLANA_NETWORK === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
}
```
Keep `MOMENTO_FEE.USDC_DECIMALS = 6` (both Circle mints are 6-decimals, so decimals are fine).
Note `MOMENTO_FEE` is a `const` object read at import; the consumers (launch/trade/fee-claim)
must call `getUsdcMint()` at request time rather than referencing the frozen literal — so the
constant change must be paired with consumer edits in those modules (launch, trade, feeclaim).
schema-shared introduces the resolver + devnet literal; the consuming modules switch their
call sites.

---

## P1 — schema: `VestingSchedule` has no `tokenProgram` column → Token-2022 vest/lock withdraw derives ATAs under the CLASSIC program and the claim reverts (withdraw-DoS for the default token type)

**File:** `apps/api/prisma/schema.prisma:573-606` (no `tokenProgram` field); concrete failure at
`apps/api/lib/vesting.ts:400-403` (`isT22 = false` hard-coded) and `:535-537`.

`CreatorToken.tokenProgram` defaults to `TOKEN_2022` (schema:292), so the launched-token default
IS Token-2022. `VestingSchedule` does not persist a token program, so `buildVestingWithdraw` and
`getVestingState` assume the classic SPL program and derive recipient/escrow ATAs + the claim ix
under `TokenkegQ…`. For a Token-2022 mint those ATAs/program ids are wrong and the claim build/exec
fails (reverts → no fund loss, but a hard withdraw-DoS for every launched-token vesting). This is
the deferred "VestingSchedule has no tokenProgram column" item.

The vesting audit (`audit-vesting.md`) proposes a route-level lookup as the offline fix, but the
durable correctness fix is the additive schema column requested in the prompt.

**Fix:** Additive migration + schema field (never edit applied migrations):
`tokenProgram TokenProgram NOT NULL DEFAULT 'TOKEN_2022'` on `vesting_schedules` (the launch
default), plus the `TokenProgram` Prisma enum already exists. Persist it at create from
`CreatorToken.tokenProgram`, thread it into `buildVestingWithdraw`/`getVestingState`. The schema
+ migration belong to schema-shared; the create-route write and withdraw-path read belong to
vesting. Mirror the field on `packages/shared/src/types.ts#VestingSchedule`.

---

## P1 — schema: `VestingSchedule` carries no `decimals`, and `/api/vesting/list` cannot return it → mobile withdraw sheet falls back to a hardcoded 9 and mis-scales non-9-decimal tokens

**File:** `apps/api/prisma/schema.prisma:573-606`; `apps/api/app/api/vesting/list/route.ts:52-69,86-97`.

`Trade` and `VestingSchedule` have no `decimals`, and the list route's `select` does not pull
`token.decimals`, so the response omits it. `CreatorToken.decimals` is configurable (schema:278;
default 9 but `launchTokenSchema` allows 6-9). The withdraw sheet falls back to 9, so any 6-8
decimal token renders and re-encodes withdraw amounts off by `10^(9-decimals)`. This is the
deferred "/api/vesting/list should return per-row decimals" item.

**Fix:** No new column is strictly required — `decimals` is sourceable from `CreatorToken` via the
existing `tokenId` relation. schema-shared: add `decimals` to the `tokenApi` response type used by
the withdraw sheet (`apps/api/src/services/tokenApi.types.ts` / shared types) so the contract is
explicit. vesting (route owner): add `token: { select: { decimals: true } }` to the list `select`
and return `decimals: s.token?.decimals ?? 9` per row. (Listed here because it is a contract/type
gap; the route edit is vesting-owned.)

---

## P2 — validation: `amountInBase` (trade order) has no upper bound, unlike `totalSupply`

**File:** `apps/api/lib/validation.ts:129` (`amountInBase: z.string().regex(/^[1-9]\d*$/)`).

`launchTokenSchema.totalSupply` is bounded (`refine(s.length <= 15)`), but `tradeOrderSchema`'s
`amountInBase` is unbounded. Arbitrarily large values flow into BigInt/BN/quote and the recorded
`minOut`/rebate basis before any on-chain reality check; any `Number()` display path overflows
2^53. The bigint math is safe, but recorded/displayed figures can be absurd. (Also noted in
`audit-financial-math.md` as still-open REVIEW-security P2-7; repeated here because the fix lives
in validation.ts, schema-shared scope.)

**Fix:** Add a magnitude cap mirroring `totalSupply`, e.g.
`.refine((s) => s.length <= 20, 'amountInBase too large')` (20 base-10 digits stays under 2^64),
applied to `tradeOrderSchema.amountInBase` and the vesting/lock amount fields
(`vestingCreateSchema.amountBase`, `cliffAmountBase`).

---

## P2 — validation: `vestingWithdrawSchema.amountBase` and `vestingCreateSchema` time fields are unbounded ints

**File:** `apps/api/lib/validation.ts:146-160`.

`startAt/cliffAt/endAt` are `z.number().int()` with no range — a negative or absurd unix time
passes Zod, then `new Date(input.startAt * 1000)` in the create route produces a nonsense
`startAt`/`cliffAt`/`endAt` row and `cliffSeconds/durationSeconds` derived from it. The relative
refinements (`cliffAt>=startAt`, `endAt>cliffAt`, multiple-of-`unlockEvery`) constrain ordering
but not absolute sanity (e.g. all three negative still pass). Low severity (creator-only,
self-funded), but it is unvalidated time arithmetic feeding DB date columns.

**Fix:** Bound the time fields to a plausible unix-seconds window
(`.min(0).max(4102444800)` ≈ year 2100) and `unlockEvery` to a max period.

---

## Verified CORRECT (no finding)

- **Migrations ↔ schema consistency.** All columns/enums/indexes/unique constraints/FKs in
  `20260624010000_add_token_economy` + `20260625000000_add_finalize_started_at` match
  `schema.prisma` (incl. `finalizeStartedAt`, all `@@unique`/`@@index`, the 9 new enums and the
  two `PoolType ADD VALUE`s). Migrations are additive (`IF NOT EXISTS`, no drops). The PostGIS
  caveat is documented and respected.
- **onDelete semantics.** `Trade.user`/`FundraiseContribution.user`/`VestingSchedule.user` are
  `SetNull` (correct — financial rows survive a user delete); `FeeEvent.trade` is `SetNull`
  (fee history survives a trade delete); all token-scoped children `Cascade` from
  `CreatorToken`. Sound for a financial ledger.
- **Idempotency uniques.** `Trade.signature`/`intentId`, `FeeEvent.signature`/`internalRef`,
  `FundraiseContribution.signature`/`refundSignature`, `LpPosition.positionNftMint`/
  `createSignature`, `VestingSchedule.streamId`/`createSignature`,
  `TokenFundraise.finalizeSignature` are all `@unique` and nullable (Postgres allows multiple
  NULLs, so pre-confirmation rows don't collide). Correct.
- **`LpPosition @@unique([tokenId, owner])`** enforces exactly one partner + one creator position
  per token. Correct.
- **Enum parity** between `schema.prisma` and `packages/shared/src/types.ts` is exact for all 13
  token-economy enums.
- **`heliusWebhookSchema` uses `.loose()`** — the zod-v4 canonical name (not the deprecated
  `.passthrough()`). Correct per the inline note.
- **Env-flag defaults are OFF.** `.env.local.example` ships `FEE_CLAIM_ENABLED`,
  `REBATE_SEND_ENABLED`, `REBATE_LEGAL_APPROVED`, `INTENT_RECON` all `"0"`; the rebate cron
  double-gates `REBATE_SEND_ENABLED==='1' && REBATE_LEGAL_APPROVED==='1'`
  (`cron/fee-claim/route.ts:227`). Correct, blocking posture preserved.
- **Program ids** (`TOKEN_2022_PROGRAM_ID`, `TOKEN_CLASSIC_PROGRAM_ID`) match canonical SPL ids
  and are consistent across `constants.ts`, `lib/vesting.ts`, `lib/fee-claim.ts`.
- **`launchTokenSchema` bps/percent refinements** (`feeSplit` sums to 10000; LP pcts sum to 100;
  `transferFeeBps` 300-500; `decimals` 6-9; `totalSupply` length<=15) are all present and correct.
