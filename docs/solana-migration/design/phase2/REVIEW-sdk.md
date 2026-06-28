# REVIEW-sdk.md — Adversarial SDK-signature review (Phase 2, Solana-only)

Static verification of every external-SDK call in the Phase 2 implementation against the
verified spikes (`scripts/spikes/spike-{a,b,c}-*.ts`, `scripts/spikes/README.md`) and
`docs/solana-migration/research/16-solana-stack.md`, plus live re-verification of the
Helius Priority-Fee / Sender request shapes, the `@privy-io/node` server-signing API, and
the Solana CAIP-2 chain identifiers.

We CANNOT compile here. Findings are signature/shape mismatches found by reading. Each is
`{severity, file:line, suspicious call, correct signature per <source>, fix}`.

Scope reviewed: `apps/api/lib/solana/{serverWallet,priorityFee,sender,submit,connection,signer,types,errors,index}.ts`,
`apps/api/lib/helius-webhook.ts`, `apps/api/lib/fees.ts`. Cross-checked existing usage in
`apps/api/lib/helius.ts` and `apps/api/lib/jupiter.ts`.

Legend: **P0** = will break a live call / wrong on-chain effect / wrong money. **P1** = likely
breaks against the real SDK or a real Helius/Privy payload; must fix before live wiring.
**P2** = correctness/robustness nit, not signature-breaking.

---

## Summary verdict

The SDK surface is, for the most part, **faithful to the verified spikes and research doc**.
The Privy wiring is correctly seam-gated (`TODO(ops)` / `STUB_SOLANA_SIGNER`) so nothing
live can mis-fire today; the *commented* real calls are plausibly correct. The Helius
Priority-Fee and Sender request/response shapes are **verified correct** against live docs.
The Token-2022 fee math in `fees.ts` matches spike-a exactly. The webhook field names match
the Helius enhanced-tx schema. No `@solana/kit` (v2) leakage anywhere — stack is v1
throughout, as locked.

The real risks are concentrated in (1) the **Privy `signTransaction` co-signature
preservation** assumption that the entire multi-signer design rests on, which is an
explicitly-flagged open question but is load-bearing for Streamflow/JupLock and is treated
optimistically in the relay path; (2) a **priority-fee double-charge / mis-report on the
client-relay path**; and (3) a couple of webhook/fee shape robustness gaps.

---

## P0 — none

No invented method, wrong arg order, or wrong on-chain money effect was found in code that
can execute today. (The one money-relevant path — `fees.calcFee`/`grossUpTokenRebate` — is
byte-for-byte the spike-a algorithm; the Sender body and priority-fee shape verified
correct.)

---

## P1 findings

### P1-1 — Privy server `signTransaction` co-signature preservation is assumed, not proven, and the relay path depends on it
- **File:** `apps/api/lib/solana/serverWallet.ts:116-128`; consumed by `signer.ts:30-35` and `submit.ts:334-335,406-409`.
- **Suspicious:** The whole multi-signer design (ephemeral `partialSign` first, then the
  Privy server signer) assumes `walletApi.solana.signTransaction` **returns a tx that keeps
  the already-attached ephemeral signatures**. `applySigners` signs ephemerals locally, then
  hands the tx to Privy. If Privy re-serializes/strips foreign sigs, the Streamflow
  `metadata` / JupLock `base` co-signature is lost and the tx fails on-chain.
- **Per source:** `research/16-solana-stack.md` §"Privy signing" + `spike-c` "HIGHEST-RISK
  DETAIL" (caveat #1) and the `TODO(verify-devnet)` in `serverWallet.ts:124-128` all flag
  this as **unverified**. Live Privy docs expose a single-tx `signTransaction({ walletId,
  caip2, transaction })` returning `{ signedTransaction }` — they do **not** document
  preservation of pre-attached partial signatures.
- **Fix:** Keep the seam, but make the failure mode explicit and tested: (a) when a tx
  carries an ephemeral signer AND a `privy-server` signer, after `wallet.signTransaction`
  re-attach the ephemeral signatures (re-`partialSign` the ephemerals AFTER the Privy call,
  not before) OR verify all required sigs present and throw `PARTIAL_SIGN_UNSUPPORTED`
  (the code already defines this code in `errors.ts:16` but never raises it). (b) Until
  verified on devnet, route co-signed (Streamflow/JupLock) txns through the **client
  embedded wallet** relay, not the server wallet — exactly the fallback the `serverWallet.ts`
  TODO names. This is the single highest-value item to confirm before Phase 3.

### P1-2 — Client-relay submit reports `priorityFeeMicroLamports: 0` and cannot honor a per-call fee override
- **File:** `apps/api/lib/solana/submit.ts:419-422` (and the build/submit split at `354-380` → `389-430`).
- **Suspicious:** `buildUnsignedForClient` bakes the ComputeBudget ixs (incl. the Helius
  estimate) into the message at *build* time. `submitClientSigned` then sets
  `priorityFeeMicroLamports = opts.computeUnitPriceMicroLamports ?? 0` — so the
  `SubmitResult.priorityFeeMicroLamports` is **0** for every relayed client tx (the real
  baked fee is unreported), and any `computeUnitPriceMicroLamports` passed to
  `submitClientSigned` is **silently ignored** (the budget ix is already signed into the
  client tx and cannot change).
- **Per source:** Not a spike signature, but a self-consistency defect vs `types.ts:60-61`
  (the option is advertised as "override the Helius estimate") and `SubmitResult`
  (`types.ts:66`) which is documented as the fee actually applied.
- **Fix:** Carry the build-time estimate through the relay (return it from
  `buildUnsignedForClient` and pass it into `submitClientSigned`, or re-read it from the
  decoded ComputeBudget ix), and either honor or reject (`SIGNER_REJECTED`)
  `computeUnitPriceMicroLamports` on the relay path rather than dropping it.

### P1-3 — `submitClientSigned` route='sender' will prepend NO Jito tip yet still tip-gate, or land with no tip
- **File:** `apps/api/lib/solana/submit.ts:361` (build forces `route:'rpc'`, no tip) vs `396,422,424` (submit allows `route:'sender'`).
- **Suspicious:** `buildUnsignedForClient` hard-codes `route:'rpc'` so it never prepends
  `jitoTipIx` (correct — no tip on the client build). But `submitClientSigned` accepts
  `opts.route='sender'` and then `broadcastOnce` POSTs to Helius Sender. Per Helius Sender
  spec (verified) a Sender tx **must carry a Jito tip transfer ix**; this relayed tx has
  none, so Sender rejects it (`TIP_TOO_LOW`/no-tip) — or, worse, the tip is never added
  while `jitoTipLamports` is still reported in the result (`422`).
- **Per source:** `sender.ts:1-12` header + `research/16` §Sender ("Requires a Jito tip").
- **Fix:** Either forbid `route:'sender'` in `submitClientSigned` (client-relay = `rpc`
  only; throw if `opts.route==='sender'`), or have the relay add the tip ix on the server
  side before the client signs (the tip's `fromPubkey` would then be the client/user, which
  conflicts with `jitoTipIx` using the server wallet at `sender.ts:74` — so forbidding
  Sender on the relay path is the clean fix and matches the build-time `route:'rpc'`).

### P1-4 — `getDefaultTipLamports(swqosOnly=true)` over-tips by 40× (default 200_000 not 5_000)
- **File:** `apps/api/lib/solana/sender.ts:34-40`.
- **Suspicious:** When `swqosOnly` and `JITO_TIP_LAMPORTS` is unset, `want` falls back to
  `MIN_TIP_LAMPORTS` (200_000), then `max(5_000, 200_000) = 200_000`. The swqos route's
  whole point (verified: 0.000005 SOL min) is undercut — every swqos tx pays the full
  0.0002 SOL.
- **Per source:** `sender.ts:23-24` constants + `research/16` §Sender + verified Helius
  Sender doc (swqos min 0.000005 SOL).
- **Fix:** Default `want` to the route-correct minimum: `const want = Number.isFinite(parsed)
  ? parsed : min;` (use `min`, not the dual-route `MIN_TIP_LAMPORTS`).

---

## P2 findings

### P2-1 — `serverWallet.ts` commented Privy method: confirm `signTransaction` (not `signAndSendTransaction`) and the `caip2` arg name
- **File:** `apps/api/lib/solana/serverWallet.ts:86-91, 117-122`.
- **Note:** The commented real calls
  (`new PrivyClient({ appId, appSecret, walletApi: { authorizationPrivateKey } })` and
  `walletApi.solana.signTransaction({ walletId, caip2, transaction })`) are **plausibly
  correct** and match `research/16`. Live Privy docs confirm `walletApi.solana` exposes both
  `signTransaction` and `signAndSendTransaction` with `walletId` + `caip2` + `transaction`.
  Choosing `signTransaction` (self-submit) over `signAndSendTransaction` is the **correct,
  intentional** decision per `research/16` §"no custom-RPC field → self-submit". One drift
  risk: some `@privy-io/node` minors expose the fluent form
  `privy.wallets().solana().signTransaction(walletId, { transaction })`; pin the version and
  confirm the `walletApi.solana.*` shape against the installed SDK before un-gating.
- **Per source:** `research/16` §Privy; live `docs.privy.io` server signing reference.
- **Fix:** Add a `TODO(verify)` note pinning the `@privy-io/node` version and the exact
  `walletApi.solana.signTransaction` shape; keep `signTransaction` (not `signAndSend`).

### P2-2 — CAIP-2 strings are CORRECT — recorded to prevent a "fix" regression
- **File:** `apps/api/lib/solana/serverWallet.ts:55-63`.
- **Note:** `mainnet-beta → solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` and
  `devnet → solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` are both **verified correct** against
  the Chain-Agnostic Solana namespace and Privy's `SolanaCaip2ChainId`. The inline comments
  label them correctly. No change. (The `TODO(verify-devnet)` at `:56-57` can be downgraded —
  the strings are confirmed; only the live round-trip remains.)

### P2-3 — Priority-fee estimate is computed from an UNSIGNED, post-budget serialization
- **File:** `apps/api/lib/solana/submit.ts:96-103` (`prependBudget`).
- **Note:** The request shape is **verified correct** (`params:[{ transaction, options:{
  priorityLevel } }]`, PascalCase levels, `result.priorityFeeEstimate`). Sending an
  unsigned base64 tx is accepted by Helius. Minor: the estimate is taken *after* the
  ComputeBudget ixs are prepended but the serialized tx has no signatures — Helius sizes the
  fee off the writable accounts/CU regardless, so this is fine, but if a future Helius
  revision requires a signed tx the estimate would degrade to the floor. Low risk.
- **Per source:** verified `helius.dev/docs/.../getpriorityfeeestimate`.
- **Fix:** None required; optionally pass `accountKeys` of writable accounts as a more
  robust fallback than the unsigned-tx string.

### P2-4 — `helius-webhook.ts` enhanced-payload field names match; `tokenAmount` decimal handling is a precision risk
- **File:** `apps/api/lib/helius-webhook.ts:114-174, 270-273`.
- **Note:** Field names `signature`, `tokenTransfers[].{mint,fromUserAccount,toUserAccount,
  tokenAmount}`, `accountData`, `events`, and `timestamp` (unix seconds) **all match** the
  Helius enhanced-webhook schema. `tokenAmount` in the enhanced payload is a **UI/decimal
  amount** (whole tokens), so `BigInt(Math.round(grossWhole * 10 ** decimals))`
  (`:273`) is the right conversion direction — but `Math.round` on a JS float for
  high-decimals (9) large amounts can lose precision past ~2^53. For big trades the
  base-unit gross (and thus the withheld fee in `calcFee`) can be off by a few base units.
- **Per source:** Helius enhanced-tx docs; spike-a `calcFee` (integer base-unit math).
- **Fix:** Prefer the raw token-amount fields when present (`tokenTransfers[].rawTokenAmount.
  {tokenAmount, decimals}` exist in the enhanced schema) and do integer parsing instead of
  float multiply; this keeps the base-unit math exact, matching the spike's bigint approach.

### P2-5 — `helius.ts` `searchAssets` uses `params` as a bare object while `priorityFee.ts` wraps in an array — both correct, but worth a note
- **File:** `apps/api/lib/helius.ts:53-63` vs `apps/api/lib/solana/priorityFee.ts:56-61`.
- **Note:** Helius DAS `searchAssets` takes a **named-object** `params`; Helius
  `getPriorityFeeEstimate` takes a **single-element array** `params:[{...}]`. The code uses
  each correctly (object for DAS, array-wrapped object for the priority-fee method). Recorded
  only because the inconsistency looks like a bug at a glance and a future "cleanup" could
  wrongly normalize them. No change.
- **Per source:** verified Helius DAS + Priority-Fee docs.

### P2-6 — `submit.ts` `setComputeUnitLimit` is always prepended even on the client-relay path; web3.js v1 surface confirmed
- **File:** `apps/api/lib/solana/priorityFee.ts:95-102`, `submit.ts:105,115`.
- **Note:** `ComputeBudgetProgram.setComputeUnitLimit({ units })` and
  `setComputeUnitPrice({ microLamports })` are the **correct** web3.js v1 builders (object
  args). `tx.instructions = [...]` mutation and `tx.compileMessage()` (`submit.ts:55`) are
  valid v1 APIs. No signature issue. Minor: on the client-relay build, the default
  `DEFAULT_COMPUTE_UNIT_LIMIT = 400_000` is used with no simulation (the pipeline doc at
  `submit.ts:7` mentions "simulate to size compute units" but `prependBudget` never
  simulates), so client txns may over- or under-provision CU. Robustness nit only.
- **Fix:** Either implement the documented simulation step or drop the "simulate" line from
  the header comment to avoid a doc/impl mismatch.

### P2-7 — `fees.ts` money math VERIFIED against spike-a (no defect) — recorded for completeness
- **File:** `apps/api/lib/fees.ts:46-92`.
- **Note:** `calcFee` = `floor(gross*bps/10_000)` capped at `maxFee` (spike-a `calcFee`,
  exact). `grossUpTokenRebate` = `ceil(net*10_000/(10_000-bps))` = spike-a's
  `(idealRebate*10_000 + (10_000-FEE_BPS-1)) / (10_000-FEE_BPS)` (exact integer ceil). The
  `>=100% fee` guard (`:89`) is a sound addition not in the spike. `attribute2080` correctly
  fixes protocol at `PROTOCOL_FEE_BPS` (20%) and splits the remaining 80% partner/creator
  with remainder-to-creator (no dust lost), matching spike-b's split semantics. No SPL /
  web3.js call is made here (pure math) — nothing to mis-signature. No change.

---

## Cross-cutting confirmations (no action)

- **No `@solana/kit` (v2) leakage.** Every file imports from `@solana/web3.js` (v1) /
  `@solana/spl-token`. Matches the locked decision (`research/16` §"web3.js v1 vs v2").
- **Helius Sender body** (`sender.ts:102-110`): `method:"sendTransaction"`,
  `params:[base64Tx, { encoding:"base64", skipPreflight:true, maxRetries:0 }]`, endpoint
  `sender.helius-rpc.com/fast`, `?swqos_only=true` query toggle — **all verified correct**.
- **Helius RPC URL** (`connection.ts:44-45`, mirrors `helius.ts:7-12`): correct host split
  and `?api-key=` param; `SOLANA_RPC_URL` override is a sane addition. No issue.
- **Spike-b/c SDK calls** (Meteora DBC/cp-amm, Streamflow, Jupiter Lock) are **not yet
  imported** anywhere under `apps/api/lib/` — Phase 2 stops at the signer/submit/fees/webhook
  layer. Those SDK signatures (e.g. `client.partner.createConfig`, `migrateToDammV2`,
  `prepareCreateInstructions`, `createVestingEscrowV2`) remain to be reviewed when Phase 3
  builders land; the spikes already carry verbatim-from-`.d.ts` signatures + `TODO verify`
  markers for the minor-version-sensitive readers.

---

## Counts

- **P0: 0**
- **P1: 4** (P1-1 Privy co-sig preservation; P1-2 relay fee mis-report/ignored override;
  P1-3 relay+Sender tip gap; P1-4 swqos over-tip)
- **P2: 7**
