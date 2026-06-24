# D-LAUNCH — Phase 3A: Creator-Token Launch (`lib/launch.ts` + `POST /api/tokens/launch`)

> **Status:** DESIGN ONLY. Implementation-ready spec, no code. Solana-only, `@solana/web3.js` **v1**.
> **Builds on (read + reuse, do NOT redesign):**
> - Schema: `apps/api/prisma/schema.prisma` — `CreatorToken` (extended), `TokenFeeConfig`, `TokenFundraise` (Phase 2, MERGED).
> - Signer/submit: `apps/api/lib/solana/*` — `submit`, `serverSigner`, `ephemeralSigner`, `applySigners`, `buildUnsignedForClient`, idempotency. **Every** on-chain tx goes through this layer.
> - Constants: `packages/shared/src/constants.ts` `MOMENTO_FEE` + `packages/shared/src/types.ts`.
> - Contracts: `docs/solana-migration/design/phase2/CONTRACTS.md`, `D-api.md §3.1`.
> **GROUND TRUTH for CPI signatures:** `scripts/spikes/spike-a-token2022-fee-rebate.ts` (Token-2022 mint + TransferFeeConfig), `scripts/spikes/spike-b-meteora-dbc.ts` (DBC `createConfig`/`createPool`, `dynamic-bonding-curve-sdk@1.5.10`). Reuse exact signatures; do not invent.

---

## 0. The decisive open question (spike-b §1) — RESOLVED from the spike code

> **Can DBC launch a curve over a PRE-EXISTING taxed Token-2022 mint, or does the SDK mint the base mint?**

**Answer (read from the verified spike-b surface): the DBC SDK MINTS THE BASE MINT.**

Evidence in `spike-b-meteora-dbc.ts`:

- `client.creator.createPool({ name, symbol, uri, payer, poolCreator, config, baseMint })` where
  `baseMint = Keypair.generate()` (line 438) and `baseMint` is passed as a **required signer**
  (`poolSigners` includes `baseMint`, line 454–456). A fresh keypair that must sign `createPool` is the
  account being **created/initialized** by the instruction — not a reference to an already-initialized mint.
- The base-token shape (decimals, supply, authority option, **`tokenType: TokenType.Token2022`**) is carried
  on the **config** (`buildCurveWithMarketCap({ token: { tokenType, tokenBaseDecimal, totalTokenSupply, … } })`,
  lines 354–364) and consumed at `createPool` time. The program initializes the mint with those parameters.
- `createPool` also takes `name`/`symbol`/`uri` — i.e. it writes **metadata** at init. A pre-existing mint
  would already have metadata; passing it again only makes sense if the program is creating the mint.

**Therefore:** we do **NOT** pre-create a taxed Token-2022 mint and hand it to DBC. We attach the
TransferFeeConfig **at config/createPool time**, not as a separate pre-step.

### 0.1 How we attach our TransferFeeConfig — TWO candidate paths, pick at devnet

The hard sub-question: when DBC creates the Token-2022 base mint, **does `dynamic-bonding-curve-sdk@1.5.10`
let us specify the `TransferFeeConfig` extension** (bps/maxFee/authorities) on that mint, or does it only set
the metadata-pointer extension?

- **Path A (PREFERRED — config-time extension):** the DBC config/`createPool` initializes the base mint with
  the TransferFee extension when the curve `token` config requests it. spike-b's STEP-7 finding states Meteora
  supports "all token2022 with metadata pointer **and transfer fee** extensions … permissionlessly" across
  DBC → DAMM v2 → DLMM (`spike-b` lines 744–748; `research/10-meteora.md §5`). If the 1.5.10 `TokenConfig` /
  `createPool` params expose transfer-fee fields (bps, maxFee, transferFeeConfigAuthority, withdrawWithheldAuthority),
  we set them there and the mint is born taxed in the **same** instruction set that creates the curve.
  `TODO(verify-devnet): confirm 1.5.10 createConfig/createPool TokenConfig exposes TransferFeeConfig fields
  (bps, maxFee, the two authorities). Inspect the installed package .d.ts (dist/index.d.ts TokenConfig /
  CreatePoolParams) — do NOT assume; the spike-b .d.ts excerpt did not enumerate transfer-fee fields.`
- **Path B (FALLBACK — atomic post-init extension in the same tx, ONLY if Path A unsupported):** if 1.5.10
  does **not** expose transfer-fee fields, we cannot retro-fit the extension after `InitializeMint` (Token-2022
  forbids adding extensions to an initialized mint). The fallback is to **prepend** the extension init to the
  `createPool` instruction list **before** the program's `InitializeMint` runs — only viable if the program
  expects an externally-allocated/sized base-mint account (it does not, per spike-b: the base mint is a fresh
  keypair the program initializes). **If Path A is unsupported, Path B is NOT mechanically possible with a
  program-initialized mint.** In that case the architecture decision escalates:
  `TODO(verify-devnet): if 1.5.10 cannot create a transfer-fee base mint, choose between
  (i) a newer DBC SDK/program version that does, or (ii) launching the curve over a plain SPL/Token-2022 mint
  and applying the tax via the DAMM-v2 post-graduation pool only. This blocks the tax architecture; surface to
  the Phase-3 owner before committing.` This is the single highest-risk item in the module (matches spike-b's
  own "highest-risk item to re-verify").

### 0.2 Metadata decision — Token-2022 metadata pointer (NOT Metaplex Token Metadata)

**Decision: Token-2022 metadata pointer + on-mint metadata (the extension `createPool` already writes), NOT a
separate Metaplex Token Metadata account.** Justification:

1. **DBC already writes it.** `createPool` takes `name`/`symbol`/`uri` and the spike-b STEP-7 finding names the
   **metadata pointer** extension as the permissionlessly-supported path through DBC/DAMM-v2/DLMM. Using Metaplex
   would mean a second account + CPI we don't control inside the curve-launch tx.
2. **One tx, fewer signers, lower rollback surface.** A separate Metaplex `CreateMetadataAccountV3` adds a CPI to
   a non-Meteora program and a Metaplex PDA to manage on rollback. The metadata-pointer keeps the whole mint
   self-describing inside the Token-2022 account the curve already creates.
3. **Compatibility.** Meteora's permissionless Token-2022 support is gated on metadata-pointer + transfer-fee
   extensions specifically; Metaplex metadata is orthogonal and not required by the rail.

`uri` points to an off-chain JSON (name/symbol/image/description) we host — see §3 step 1. `imageUrl` from the
request is uploaded/pinned and embedded in that JSON.
`TODO(verify-devnet): confirm 1.5.10 sets the metadata-pointer extension self-referentially (pointer → mint
itself) vs an external metadata account, and that the on-chain name/symbol byte limits accommodate our inputs.`

---

## 1. Inputs this module consumes (from Phase 2, unchanged)

- `MOMENTO_FEE` (`packages/shared/src/constants.ts`): `USDC_MINT`, `USDC_DECIMALS=6`, `TOKEN_2022_PROGRAM_ID`,
  `DEFAULT_TRANSFER_FEE_BPS=400`, `TARGET_IN_APP_BPS=100`, `PROTOCOL_FEE_BPS=2000`,
  `DEFAULT_CREATOR_TRADING_FEE_BPS=5000`, `DEFAULT_PARTNER_TRADING_FEE_BPS=5000`.
- Env (already declared in CONTRACTS §d): `MOMENTO_LP_FEE_CLAIMER` (Meteora `feeClaimer`/partner = Momento),
  `MOMENTO_CREATOR_FEE_PCT` (→ `creatorTradingFeePercentage`), `SOLANA_NETWORK`, `PRIVY_SERVER_WALLET_ID`,
  Upstash (durable idempotency — REQUIRED for server-signed broadcast, fail-closed per `submit.ts`).
- Signer layer: `getServerWallet()`/`serverSigner()` (Momento treasury = `payer`, `feeClaimer`, `leftoverReceiver`,
  transferFee + withdrawWithheld authorities), `ephemeralSigner(kp)` (the `config` and `baseMint` keypairs),
  `submit()` with `route:'sender'` (launch is a high-value tx — Jito tip; matches `types.ts` comment).

**Who signs the launch?** Per spike-b's prod-path note (lines 41–48) launch is a **platform action**: Momento is
`payer` + `partner`/`feeClaimer`, signed by the **Privy server wallet** (`serverSigner()`), co-signed by the
ephemeral `config` + `baseMint` keypairs (`ephemeralSigner()`). The **creator** is `poolCreator` (claims creator
trading-fee share) but per DBC, `poolCreator` is a signer on `createPool`. We have two sub-options; see §3 step 3.

---

## 2. `lib/launch.ts` — TypeScript interface (design)

```ts
import type { SubmitResult } from '@/lib/solana';

/** Configurable knobs, all bps/percent, validated upstream by launchTokenSchema. */
export interface LaunchTokenInput {
  creatorUserId: string;          // CreatorToken.userId (resolved from requireCreator())
  creatorWallet: string;          // base58; poolCreator + creatorFeeWallet default
  name: string;                   // 1..32, on-chain name byte-limited
  symbol: string;                 // 1..10, uppercased
  description?: string;
  imageUrl?: string;              // pinned → embedded in metadata JSON uri

  totalSupply: string;            // base-unit string; default "1000000000" (whole) — see decimals
  decimals?: number;              // 6..9 (DBC TokenDecimal); default 9 (schema default)

  // ── Token-2022 transfer-fee (TokenFeeConfig) ──
  transferFeeBps?: number;        // 300..500; default MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS (400)
  transferFeeMaxBaseUnits?: string; // maxFee cap; default a non-binding large value (see §3.1)

  // ── DBC trading-fee split (of the 80% LP fee after Meteora's 20%) ──
  creatorTradingFeeBps?: number;  // default DEFAULT_CREATOR_TRADING_FEE_BPS (5000)
  partnerTradingFeeBps?: number;  // default DEFAULT_PARTNER_TRADING_FEE_BPS (5000); sum must = 10000

  // ── Fundraise / curve shape (TokenFundraise) ──
  fundraise: {
    targetUsd: number;            // → migration market cap (USDC) → migration_quote_threshold
    initialMarketCapUsd?: number; // curve start FDV; default small (e.g. 100)
    // post-graduation LP distribution (must sum to 100):
    partnerLockedLpPct?: number;  // default 50
    partnerLpPct?: number;        // default 0
    creatorLockedLpPct?: number;  // default 50
    creatorLpPct?: number;        // default 0
    minContributionBaseUnits?: string;
    maxContributionBaseUnits?: string;
  };
}

export interface LaunchResult {
  tokenId: string;                // CreatorToken.id
  mintAddress: string;            // base58 of the DBC-created Token-2022 base mint
  dbcConfigKey: string;           // config account pubkey
  dbcPoolAddress: string;         // derived virtual-pool address
  status: 'DEPLOYING' | 'ACTIVE'; // ACTIVE once both tx confirm
  configSignature: string;
  poolSignature: string;
}

/**
 * Orchestrates the full launch: persist PENDING row → build+submit createConfig →
 * build+submit createPool → persist mint/config/pool + flip status. Idempotent on
 * `tokenId` (re-entrant: resumes at the first incomplete on-chain step). Rolls
 * back DB state to FAILED on unrecoverable partial failure (see §4).
 */
export function launchCreatorToken(input: LaunchTokenInput): Promise<LaunchResult>;

/** Pure builders (no network) — testable; each returns a BuiltTx for submit(). */
export function buildCreateConfigTx(ctx: LaunchContext): Promise<import('@/lib/solana').BuiltTx>;
export function buildCreatePoolTx(ctx: LaunchContext): Promise<import('@/lib/solana').BuiltTx>;

/** Internal: resolved knobs + generated ephemeral keypairs + DBC client + connection. */
export interface LaunchContext {
  input: LaunchTokenInput;
  configKeypair: import('@solana/web3.js').Keypair;   // ephemeralSigner()
  baseMintKeypair: import('@solana/web3.js').Keypair; // ephemeralSigner()
  quoteMint: import('@solana/web3.js').PublicKey;     // MOMENTO_FEE.USDC_MINT
  feeClaimer: import('@solana/web3.js').PublicKey;    // MOMENTO_LP_FEE_CLAIMER
  metadataUri: string;
}
```

> **DESIGN NOTE — single vs two transactions.** spike-b runs `createConfig` and `createPool` as **two separate
> transactions** (`configSig`, then `poolSig`), each with its own signer set. We mirror that (two `submit()`
> calls) because (a) it matches verified spike behavior, and (b) it lets idempotency/rollback resume at a clean
> boundary (config landed, pool not). `TODO(verify-devnet): if 1.5.10 supports a one-config-many-pools model,
> a Momento-shared config could be created ONCE and reused per launch (createPool only). Default to per-launch
> config now; optimize later.`

---

## 3. Step sequence (orchestration)

All on-chain tx via `submit({ tx, signers, label }, { route:'sender', commitment:'confirmed' })`. The
ephemeral `config`/`baseMint` keypairs are `ephemeralSigner()`; Momento treasury is `serverSigner()`. Durable
Upstash idempotency is mandatory (server-signed → `submit.ts` fails closed without it).

**Step 0 — Validate + authorize (route handler, §5).** `requireCreator`, `validateBody(launchTokenSchema)`,
`writeLimiter`, wallet-ready check, **one-token-per-creator guard** (`@@unique([userId, chain])` already enforces
it — pre-check returns a clean 409 instead of a DB error).

**Step 1 — Prepare metadata + resolve knobs.** Upload/pin `imageUrl`; build + host the metadata JSON
(`name`,`symbol`,`description`,`image`); `metadataUri` = its URL. Resolve all defaults from `MOMENTO_FEE`/env.
Compute `maxFee` for the TransferFeeConfig: default to a non-binding cap (e.g. `totalSupply` base units) so the
`bps` rate governs — spike-a sets `MAX_FEE` high deliberately (lines 112–113). Persist `transferFeeMaxBaseUnits`.

**Step 2 — Persist `CreatorToken` (PENDING) + `TokenFeeConfig` + `TokenFundraise` (DRAFT)** in ONE Prisma
transaction, BEFORE any chain call. This row is the idempotency anchor + rollback target. Set:
`status=PENDING`, `tokenProgram=TOKEN_2022`, `chain="solana"`, `decimals`, `totalSupply`,
`quoteMint=USDC`, `transferFeeBps`, `transferFeeMaxBaseUnits`,
`transferFeeAuthority=withdrawWithheldAuthority=<treasury>`. `mintAddress`/`dbcConfigKey`/`dbcPoolAddress`
stay null until the chain steps land. (Why persist first: a crash after a chain tx but before DB write must be
recoverable by `tokenId` — see §4.)

**Step 3 — `createConfig` (DBC).** Build via `client.partner.createConfig({ config, feeClaimer, leftoverReceiver,
quoteMint, payer, ...buildCurveWithMarketCap({...}) })` (spike-b lines 419–426). Map knobs **exactly** as spike-b:
- `token`: `tokenType: TokenType.Token2022`, `tokenBaseDecimal: TokenDecimal[decimals]`,
  `tokenQuoteDecimal: TokenDecimal.SIX`, `tokenAuthorityOption`, `totalTokenSupply`, `leftover` — **plus the
  TransferFeeConfig fields (Path A, §0.1) if 1.5.10 exposes them.**
- `fee`: `baseFeeParams` (FeeSchedulerLinear, fixed), `collectFeeMode: CollectFeeMode.QuoteToken` (USDC-only,
  clean accounting), `creatorTradingFeePercentage` (from `creatorTradingFeeBps`).
- `migration`: `MigrationOption.MET_DAMM_V2`, `migrationFeeOption`, `migratedPoolFee` (QuoteToken).
- `liquidityDistribution`: the four `partner*/creator*` LP percentages (must sum to 100).
- `activationType: ActivationType.Timestamp`, `initialMarketCap`, `migrationMarketCap` (= `targetUsd`, this sets
  `migration_quote_threshold`).
Signers: `serverSigner()` (payer) + `ephemeralSigner(configKeypair)`. `label:'dbc.createConfig'`.
On confirm: persist `dbcConfigKey = configKeypair.publicKey` + `status=DEPLOYING`.

**Step 4 — `createPool` (DBC).** Build via `client.creator.createPool({ name, symbol, uri:metadataUri, payer,
poolCreator, config, baseMint })` (spike-b lines 443–451). **This is the instruction that creates the taxed
Token-2022 base mint.** Signers: `serverSigner()` (payer) + `ephemeralSigner(baseMintKeypair)`
+ `poolCreator`.
- `poolCreator` sub-decision: the creator must sign as `poolCreator`. **Default (platform-action model):** set
  `poolCreator = <Momento treasury>` so launch is fully server-signed (single Privy server sign + 2 ephemerals),
  and record the human creator via `TokenFeeConfig.creatorFeeWallet` / `creatorTradingFeeBps`; the creator's
  trading-fee CLAIM (Phase 3 `POST /api/creators/[id]/fees/claim`) is the only place the creator-as-claimant
  identity is needed, and that is admin/server-signed too. **Alternative (creator-as-poolCreator):** set
  `poolCreator = creatorWallet` and use the **client-relay** path (`buildUnsignedForClient` → creator signs in
  app → `submitClientSigned` with `serverSigner` as `extraSigner`). `TODO(verify-devnet): confirm DBC requires
  poolCreator to be a tx SIGNER (spike-b includes it in poolSigners). If yes and we want the creator to literally
  own poolCreator, the launch MUST go through the client-relay flow (mixed server+client+ephemeral signers).
  Default to poolCreator=treasury for a clean single server-sign; revisit if product needs on-chain creator
  ownership of poolCreator.`
- Derive pool address via `deriveDbcPoolAddress(quoteMint, baseMint, config)` or `client.state.getPoolByBaseMint`
  (spike-b `resolvePoolAddress`, lines 678–692). `label:'dbc.createPool'`.

**Step 5 — Persist success.** In one Prisma tx: `mintAddress = baseMintKeypair.publicKey`,
`dbcPoolAddress`, `poolType=METEORA_DBC`, `deployTxSignature = poolSignature`, `deployedAt=now`,
`status=ACTIVE`; `TokenFundraise.status=ACTIVE`, `thresholdBaseUnits` (USDC base units of `targetUsd`),
LP-distribution bps, `migrationFeeBps`, `leftoverReceiver`. Return `LaunchResult`.

**Step 6 — Webhook handoff.** Graduation (DBC→DAMM v2) and trade ingest are NOT this module's job — the Phase 2
`POST /api/webhooks/helius` ingest flips `status` and writes `LpPosition`/`Trade`/`FeeEvent`. Launch only needs
to register the new pool address with the Helius webhook subscription (or rely on a program-wide subscription).
`TODO(verify-devnet): confirm Helius webhook is subscribed at the DBC program level (no per-pool registration)
vs needs per-pool address add on launch.`

---

## 4. Idempotency + rollback (partial-failure design)

**Idempotency anchors (two layers):**
1. **DB-level (per launch):** the `CreatorToken` row keyed by `tokenId` (and `@@unique([userId, chain])`) is the
   re-entrancy anchor. `launchCreatorToken` is safe to re-call with the same `tokenId`: it reads the row's
   `status` + which of `dbcConfigKey`/`dbcPoolAddress` are set and resumes at the first incomplete step.
   **The ephemeral `config`/`baseMint` keypairs must be persisted (or deterministically derivable) so a resume
   re-uses the SAME pubkeys** — otherwise a retry creates a second config/mint. `TODO(verify-devnet): store the
   config+baseMint secret keys (encrypted, e.g. in a launch-scratch table or Privy) keyed by tokenId so a resumed
   launch reuses them. A regenerated keypair on retry = orphaned config + duplicate mint.`
2. **Tx-level (per broadcast):** `submit()` derives an idempotency key from the unsigned message and uses the
   durable Upstash store (fail-closed). A retried `createConfig`/`createPool` with the SAME built message dedups
   to the prior signature — at-most-once broadcast even across serverless instances.

**Failure matrix:**

| State at failure | Action |
|---|---|
| Step 2 (DB persist) fails | Nothing on-chain; return 500, no row (Prisma tx rolled back). |
| `createConfig` fails (no sig) | Row stays `PENDING`. Retry re-submits same config tx (dedup-safe). Bounded retries → `status=FAILED`, surface error. |
| `createConfig` lands, crash before DB write | Resume by `tokenId`: `dbcConfigKey` null but config keypair landed. Re-`submit` dedups to prior sig (idempotency) → fill `dbcConfigKey`, continue to step 4. |
| `createPool` fails (no sig) AFTER config landed | **This is the "mint ok / pool failed" case in the brief.** Config exists but is reusable. Row → `status=FAILED` with `dbcConfigKey` set; **no base mint exists yet** (the mint is created by `createPool`, so a failed `createPool` means NO orphaned taxed mint). The stranded config account is benign (no funds, no mint). Operator/cron may retry `createPool` against the existing config (resume), or abandon. **Crucially: because the SDK mints the base mint inside `createPool` (§0), there is no half-created taxed mint to clean up — config-and-pool are atomic-per-instruction.** |
| `createPool` lands, crash before DB write | Resume by `tokenId`: derive pool address from config+baseMint (`deriveDbcPoolAddress`), confirm on-chain it exists, then write step-5 fields → `ACTIVE`. |

**Rollback principle:** we never "undo" a landed on-chain account (impossible). Rollback = mark DB `FAILED` and
leave benign stranded accounts (empty config) for an ops sweep. The design deliberately orders steps so the
**only** irreversible artifact (the taxed base mint) is created in the **last** chain step (`createPool`),
minimizing orphan risk. A `FAILED` row does NOT consume the creator's one-token slot permanently:
`TODO: decide whether FAILED rows are deletable/relaunchable (relax @@unique handling) — product call.`

---

## 5. `POST /api/tokens/launch` — request / response / auth / validation / limits

**Route:** `apps/api/app/api/tokens/launch/route.ts`. **Auth:** Creator (`requireCreator`). **Limiter:**
`writeLimiter` (30/min). **Lib:** `lib/launch.ts`, `lib/prisma.ts`. Conventions per `D-api.md §0`
(`{ success, data | error }`, base-unit strings, `validateBody`).

**Order (mirrors existing routes):** `applyRateLimit(request, writeLimiter)` → `requireCreator(request)` →
`validateBody(launchTokenSchema, body)` → wallet-ready (`getWalletForChain(user)` not null) → one-token guard
(409 if creator already has a row) → `launchCreatorToken(...)`.

**Request (`launchTokenSchema`, new in `lib/validation.ts`):**
```jsonc
{
  "name": "Deel Token",
  "symbol": "DEEL",
  "description": "…",
  "imageUrl": "https://…",
  "totalSupply": "1000000000",
  "decimals": 9,
  "transferFeeBps": 400,
  "feeSplit": { "creatorBps": 5000, "partnerBps": 5000 },
  "fundraise": {
    "targetUsd": 25000,
    "initialMarketCapUsd": 100,
    "partnerLockedLpPct": 50, "partnerLpPct": 0,
    "creatorLockedLpPct": 50, "creatorLpPct": 0
  }
}
```
Validation rules: `symbol` 1–10 uppercased; `name` 1–32; `transferFeeBps` ∈ [300,500];
`feeSplit.creatorBps + partnerBps === 10000`; LP pcts sum to 100; `targetUsd > 0`; `decimals` ∈ [6,9];
`totalSupply` positive integer string. Reject unknown fields.

**Response (200):**
```jsonc
{ "success": true, "data": {
  "tokenId": "ct_…",
  "mintAddress": "Hxk…",
  "dbcConfigKey": "Cfg…",
  "dbcPoolAddress": "Pool…",
  "poolType": "METEORA_DBC",
  "status": "ACTIVE",
  "configSignature": "5xq…",
  "poolSignature": "3pQ…"
} }
```

> **Deviation from `D-api.md §3.1` (intentional, justified):** the Phase-2 contract sketch returned
> `{ transaction: "<base64-unsigned>" }` (client-signed). We return **landed signatures**, because launch is a
> **platform action** signed by the Privy **server wallet** (spike-b prod-path note + the locked "Privy server
> wallet for platform actions" decision), not client-signed. If the creator-as-`poolCreator` alternative (§3
> step 4) is chosen, the response reverts to the `{ transaction }` relay shape and `status` is `DEPLOYING` until
> the client self-submits. Default = server-signed.

**Error mapping (via `SolanaTxError.code` → envelope):** `CONFIG_MISSING`→500; `SIMULATION_FAILED`→400 (bad
params/insufficient rent); `INSUFFICIENT_FUNDS`→402/400 (treasury underfunded — ops alert);
`DUPLICATE`→200 (return prior `LaunchResult`); `TIMEOUT`/`BLOCKHASH_EXPIRED`→202 (DEPLOYING, retriable);
others→500. `requireCreator` throws a `Response` (catch + return as-is, per swap route).

---

## 6. Cross-module interfaces others depend on

**`CreatorToken` fields this module SETS (consumers: `lib/fees.ts`, `lib/trade.ts`, webhook ingest, `GET /api/tokens/[mint]`):**
- `mintAddress` ← DBC-created base mint (base58). `@unique` — the canonical token key everywhere downstream.
- `tokenProgram = TOKEN_2022`, `decimals`, `totalSupply`, `quoteMint = USDC`.
- `transferFeeBps`, `transferFeeMaxBaseUnits`, `transferFeeAuthority`, `withdrawWithheldAuthority`
  (all = Momento treasury) — `lib/fees.ts` harvest/withdraw + rebate accounting read these.
- `dbcConfigKey`, `dbcPoolAddress`, `poolType = METEORA_DBC`, `poolAddress = dbcPoolAddress`.
- `status` lifecycle: `PENDING → DEPLOYING → ACTIVE` (webhook later → `GRADUATED`), `deployTxSignature`, `deployedAt`.

**`TokenFeeConfig` (1:1) SET:** `transferFeeBps`, `rebateTargetBps` (default 100), `creatorTradingFeeBps`,
`partnerTradingFeeBps`, `protocolFeeBps=2000`, `feeClaimer`(=Momento), `creatorFeeWallet`(=creatorWallet),
`withdrawWithheldAuthority`, `rebateMint`(=USDC). `lib/fees.ts` `attribute2080`/rebate math reads these.

**`TokenFundraise` (1:1) SET:** `status=ACTIVE`, `quoteMint`, `thresholdBaseUnits` (= migration_quote_threshold),
`partnerLpBps/creatorLpBps/partnerLockedLpBps/creatorLockedLpBps`, `migrationFeeBps`, `leftoverReceiver`.
The webhook graduation handler + Phase-3 `LpPosition` writer read these to reconcile the two locked-LP NFTs.

**Consumes from `lib/solana/*`:** `submit`, `serverSigner`, `ephemeralSigner`, `getServerWallet`, `SolanaTxError`
— NEVER edits them. **Consumes** `MOMENTO_FEE`, `launchTokenSchema` (adds to `lib/validation.ts`).

---

## 7. Open `TODO(verify-devnet)` checklist (must clear before mainnet)

1. **[BLOCKER]** Does `dynamic-bonding-curve-sdk@1.5.10` `TokenConfig`/`createPool` expose `TransferFeeConfig`
   fields (bps, maxFee, transferFeeConfigAuthority, withdrawWithheldAuthority)? (§0.1 Path A vs the escalation.)
2. Metadata-pointer: self-referential pointer vs external account; on-chain name/symbol byte limits (§0.2).
3. `poolCreator` must-sign → drives server-signed vs client-relay launch (§3 step 4).
4. Persist/reuse the `config`+`baseMint` ephemeral keypairs across a resumed launch (§4).
5. `DAMM_V2_MIGRATION_FEE_ADDRESS` index semantics + `deriveDbcPoolAddress` arg order (already noted in spike-b).
6. Helius webhook subscription scope (program-level vs per-pool) for the launch→graduation handoff (§3 step 6).
7. Privy server-wallet co-signing with two ephemerals (config+baseMint) preserves their partial sigs
   (`applySigners` open question, signer.ts `TODO(verify-devnet)`).
