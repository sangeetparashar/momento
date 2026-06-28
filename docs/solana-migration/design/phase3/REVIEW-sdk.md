# Phase 3A — SDK-SIGNATURE Adversarial Review

Reviewer: adversarial SDK-signature pass. Scope: every external-SDK call in
`apps/api/lib/{launch,trade,graduation,fee-claim,vesting}.ts` checked statically
against the verified spike signatures (spike-a/-b/-c) and the `lib/solana/*`
contract. No compile available — findings are static.

Ground truth: `scripts/spikes/spike-a-token2022-fee-rebate.ts`,
`spike-b-meteora-dbc.ts`, `spike-c-vesting-lock.ts`, `scripts/spikes/README.md`,
`apps/api/lib/solana/{types,signer,submit,connection}.ts`.

Severity legend: **P0** = will fail on-chain / wrong funds / broken core
mechanism; **P1** = likely wrong, SDK-minor-sensitive, or correctness gap that
needs devnet proof before mainnet; **P2** = style / robustness / low-risk.

---

## P0 findings

### P0-1 — `createWithdrawWithheldTokensFromMintInstruction` authority arg passed a `PublicKey`, spike-a uses the high-level action with a `Signer`
File: `apps/api/lib/fee-claim.ts:477-485` (`buildWithheldClaim`).

Suspicious call:
```ts
createWithdrawWithheldTokensFromMintInstruction(
  mint, destination,
  feeVaultOwner,   // PublicKey
  [], programId,
)
```
Correct signature (@solana/spl-token, token-2022 js-legacy):
`createWithdrawWithheldTokensFromMintInstruction(mint, destination, authority: PublicKey, multiSigners?: (Signer|PublicKey)[], programId)`.
The **instruction builder** does take the authority as a `PublicKey` (it only
writes account metas), so the *argument shape here is actually correct* — BUT the
authority (`feeVaultOwner` = withdraw-withheld authority = server wallet) must be
a **required signer** on the tx. The builder marks that account as a signer in
the ix meta, and the only signer in `built.signers` is `serverSigner()` whose
`publicKey === feeVaultOwner` only when `feeConfig.withdrawWithheldAuthority`
equals the server wallet. The code computes `feeVaultOwner` from
`feeConfig.withdrawWithheldAuthority` **without verifying it equals the server
signer** (unlike `buildCreatorTradingFeeClaim`/`buildLpFeeClaim`, which skip when
owner != server). If a token was launched with a non-server
`withdrawWithheldAuthority`, this tx is built with a signer slot the submit layer
can never fill → `applySigners` throws `SIGNER_REJECTED`, OR worse the harvest
half lands and withdraw fails. Spike-a always used `withdrawWithheldAuthority =
payer` (the signer).
Fix: gate like the sibling builders — if `feeVaultOwner` (withdraw-withheld
authority) is not the server signer, `return { skip: 'withheld-authority-not-custodied' }`
instead of building an unsignable tx. (In launch.ts the authority IS set to the
treasury, so the common path is fine; this is a defensive correctness gate that
matches the §3b/§3c policy.)

### P0-2 — Partner/creator/LP claim destination ATA derived with the **classic** token program for a quote mint that may be Token-2022
File: `apps/api/lib/fee-claim.ts:684-686, 718-723, 758-763` (also rebate
`payRebate` is correct because it branches on `useUsdc`).

Suspicious call (repeated):
```ts
getAssociatedTokenAddressSync(new PublicKey(quoteMint), dest, true,
  new PublicKey(MOMENTO_FEE.TOKEN_CLASSIC_PROGRAM_ID))
```
This is used only to read the post-tx balance delta (`claimedAmountFromMeta`), so
a wrong ATA yields a **0 credited amount** → the accrual leg is recorded with
`amountBaseUnits=0` and the `CLAIMED` audit row is written as a no-fee row. That
silently **under-records every claimed fee** if the quote mint's ATA is under a
different program. USDC is classic SPL so the common path is correct, but the
hard-coded classic program id is a latent correctness bug and is inconsistent
with the rest of the module (which derives program id from `tokenProgram`).
Severity is P0 because it corrupts the fee ledger (accounting truth) rather than
just a display value, and there is no compile-time guard.
Fix: derive the quote-mint program id from the mint (or a config field), e.g. a
`quoteTokenProgramId` constant defaulting to classic for USDC, and use it in all
three `getAssociatedTokenAddressSync` calls. At minimum add a comment that this
is correct ONLY while quoteMint==USDC(classic) and assert it.

---

## P1 findings

### P1-1 — DBC `TransferFeeConfig` field names are guessed (the launch BLOCKER) — shape is plausible and TODO-flagged, but the flat-field guess is internally inconsistent with spike-a
File: `apps/api/lib/launch.ts:286-306` (`buildTokenTransferFeeConfig`), merged at
`:340-350`.

The module writes BOTH a nested `transferFeeConfig {…}` and flat fields onto the
DBC `token` config under a clear `TODO(verify-devnet) [BLOCKER]`. This is the
correct defensive posture (per the task: "assess whether the chosen shape is
plausible and clearly TODO-flagged"). Assessment:
- The BLOCKER is correctly identified, loudly flagged, and gated before mainnet. Good.
- spike-b's verbatim `.d.ts` excerpt did **not** enumerate any transfer-fee field
  on `TokenConfig`, so neither guess is confirmed; emitting both shapes is the
  right hedge offline.
- Plausibility risk: the flat-field names (`transferFeeBasisPoints`,
  `transferFeeMaxFee`, `transferFeeConfigAuthority`, `withdrawWithheldAuthority`)
  mix spike-a's instruction-arg name (`transferFeeBasisPoints` ✓ matches
  `createInitializeTransferFeeConfigInstruction`) with an invented
  `transferFeeMaxFee` (spike-a's arg is `maximumFee`, not `maxFee`/`transferFeeMaxFee`).
  If the SDK mirrors the on-chain field, the likely name is `maximumFee`.
- The authorities are `PublicKey` objects; if the SDK serializes the config as a
  plain JSON-ish bag (buildCurveWithMarketCap output spread into createConfig),
  raw `PublicKey`/`BN` may need `.toBase58()`/string — unverifiable offline.
Fix: keep the BLOCKER gate; on devnet inspect `dist/index.d.ts` `TokenConfig`/
`CreatePoolParams`, and additionally try `maximumFee` as a candidate key. Do NOT
ship until a devnet mint is confirmed to actually carry the fee (the doc already
says this).

### P1-2 — `client.pool.swap` / `cpAmm.swap` are cast `as any` and DAMM swap params are invented beyond the verified spike shape
File: `apps/api/lib/trade.ts:512-536` (`buildSwapTransaction`).

DBC `client.pool.swap({ owner, pool, amountIn, minimumAmountOut, swapBaseForQuote,
referralTokenAccount:null, payer })` matches spike-b L484-492 exactly — good
(the `as any` is unnecessary but harmless).
DAMM v2: spike-b only verified `cpAmm.swap` exists (TxBuilder). The call here
invents the full param bag: `{ owner, payer, pool, poolState, inputTokenMint,
outputTokenMint, amountIn, minimumAmountOut, referralTokenAccount }`. cp-amm
1.4.3's actual `SwapParams` is **not** in the verified surface; common cp-amm
shapes use `{ payer, pool, inputTokenMint, outputTokenMint, amountIn,
minimumAmountOut, tokenAVault, tokenBVault, tokenAMint, tokenBMint, tokenAProgram,
tokenBProgram, referralTokenAccount }` and frequently require the vault/program
fields (as the verified `claimPositionFee` does). Passing `poolState` as a param
is a guess.
Fix: re-verify `cpAmm.swap` `SwapParams` against installed `.d.ts`; it almost
certainly needs the token vault + program fields like `claimPositionFee`. Marked
`TODO(verify-devnet)` already, but the param set is more speculative than the
comment implies — call this out as unverified, not "VERBATIM from spike-b".

### P1-3 — `cpAmm.getQuote` does not exist in the verified cp-amm surface
File: `apps/api/lib/trade.ts:391-401` (`fetchExpectedOut`, DAMM branch).

Suspicious call: `(cpAmm as any).getQuote({ pool, poolState, inAmount, amountIn,
slippage, slippageBps, inputTokenMint })`. The verified cp-amm 1.4.3 surface
(spike-b L129-145) lists `claimPositionFee`, `permanentLockPosition`,
`getUserPositionByPool`, `getPositionsByUser`, `fetchPoolState`,
`isPermanentLockedPosition`, `isLockedPosition` — **no `getQuote`**. spike-b's
DBC quote helper is `client.pool.swapQuote`; for DAMM the spike never quoted.
`getQuote` is invented (the kitchen-sink param bag with both `inAmount`+`amountIn`
and `slippage`+`slippageBps` confirms it's a guess). At runtime this throws (not a
function) → caught and wrapped, so a DAMM-v2 quote always fails the live path.
Fix: confirm the real DAMM quote API. cp-amm typically exposes
`getQuote`/`getDepositQuote` OR you compute from `fetchPoolState` reserves. Verify
against installed `.d.ts`; do not rely on the current shape.

### P1-4 — DBC `client.pool.swapQuote` is `await`ed and param-shape-guessed
File: `apps/api/lib/trade.ts:377-383`.

spike-b documents `client.pool.swapQuote(params): SwapQuoteResult` as a **sync**
helper (L102). The code `await`s it (harmless for a non-promise) and passes
`{ pool, amountIn, slippageBps, swapBaseForQuote, referralTokenAccount }`. spike-b
never called `swapQuote`, so the param keys are unverified guesses (the spike used
`minimumAmountOut: new BN(0)` and a TODO for swapQuote). The result is then run
through `extractAmountOut`'s field-name fan-out, which is a reasonable hedge.
Fix: re-verify `SwapQuoteParams`/`SwapQuoteResult` keys; it likely needs the same
`config`/`poolState` the swap needs. Currently `TODO(verify-devnet)`-flagged.

### P1-5 — Jupiter Lock `claimV2` instruction name/accounts are invented (withdraw path)
File: `apps/api/lib/vesting.ts:372-384` (`buildVestingWithdraw`, JUP_LOCK branch).

spike-c verified only `createVestingEscrowV2` (create) and
`program.account.vestingEscrow.fetch` (read). The claim/withdraw instruction is
**not** in the verified surface; `claimV2(amount, { slices: [] })` with accounts
`{ escrow, escrowToken, recipient, recipientToken, tokenMint, tokenProgram,
systemProgram }` is a guess. jup-lock's actual claim ix may be named differently
(e.g. `claim`/`claimV2`) and typically also needs `memoProgram` / `eventAuthority`
/ `program` accounts (Anchor event CPI). It IS `TODO(verify-devnet)`-flagged.
Fix: fetch the devnet IDL and confirm the claim ix name + full account list
before relying on it.

### P1-6 — Streamflow `prepareWithdrawInstructions` / `prepareCancelInstructions` are not in the verified surface
File: `apps/api/lib/vesting.ts:353-358` (withdraw) and `:420-424` (cancel).

The verified Streamflow surface (spike-c L90-104) lists `create`,
`prepareCreateInstructions`, `withdraw`, `getOne`, `cancel`. It does **not** list
`prepareWithdrawInstructions` / `prepareCancelInstructions`. These lower-level
"prepare" variants likely exist (the SDK has a prepare* family) but are
unverified, and the code already hedges with `(client as any)` + a
`{ ixs } | ix[]` normalizer. The `{ invoker: { publicKey } }` extParams shape is
also a guess vs the verified `IInteractStreamExt`.
Fix: confirm `prepareWithdrawInstructions`/`prepareCancelInstructions` exist in
12.4.0; if not, use `withdraw`/`cancel` (which build+send) via a custom signer, or
the documented prepare API. Flag as unverified.

### P1-7 — Streamflow `prepareCreateInstructions` extParams.sender shape `{ publicKey } as any` may not satisfy the SDK
File: `apps/api/lib/vesting.ts:176-179` (`buildStreamflowCreate`).

spike-c passed `extParams.sender = payer` (a real `Keypair`) and used the SDK's
own signing. Here `sender: { publicKey: payer } as any` (a bare pubkey wrapper) is
passed because the module wants only the ixs (server signs later via
`applySigners`). This is plausible — `prepareCreateInstructions` should only read
`sender.publicKey` to build metas — but it's unverified that the SDK doesn't call
`sender.sign*` internally during "prepare". The returned `metadata` Keypair is
correctly destructured and wired as `ephemeralSigner(metadata)` (matches spike-c
multi-signer pattern + lib/solana `applySigners`). Good on the co-signer wiring.
Fix: verify on devnet that `prepareCreateInstructions` does not invoke a signing
method on `sender`; if it does, pass a wallet-adapter-shaped object with no-op
`signTransaction`.

### P1-8 — `creatorTradingFeePercentage` rounding can drift the on-chain split from the recorded bps
File: `apps/api/lib/launch.ts:255-257`, used at `:363`.

`creatorTradingFeePercentage(bps) = Math.round(bps/10000*100)` maps the request's
`creatorTradingFeeBps` (default 5000) to an integer percent (50). spike-b's
`creatorTradingFeePercentage` knob is an integer percent of the 80% LP fee, so
the conversion is shape-correct. But the DB persists the precise
`creatorTradingFeeBps`/`partnerTradingFeeBps` while the chain gets a rounded
integer percent — e.g. 4550 bps → 46% on-chain but 4550 recorded. For the locked
50/50 default this is exact; only custom non-round splits drift.
Fix: either constrain `creatorTradingFeeBps` to multiples of 100 at the schema, or
document that the on-chain split is integer-percent and the recorded bps is the
intent (display) — and verify the SDK field is percent (0-100), not bps.

### P1-9 — `submit()` called with a `label` in `SubmitOptions` (not a valid option field)
File: `apps/api/app/api/vesting/create/route.ts:172` — `submit(plan.built, { route: 'rpc', label: plan.built.label })`.

`SubmitOptions` (`lib/solana/types.ts:45-62`) has no `label` field — `label` lives
on `BuiltTx`. This is an excess property on an object literal → TS2353 compile
error in strict mode, and the value is ignored at runtime regardless (submit
reads `built.label`). Route-level, but it calls the lib/solana surface directly.
Fix: drop `label` from the options object: `submit(plan.built, { route: 'rpc' })`.

---

## P2 findings

### P2-1 — `derivePoolAddress` arg order relies on a spike TODO
File: `apps/api/lib/launch.ts:751-753`; `apps/api/lib/trade.ts` imports
`deriveDbcPoolAddress` but never calls it (dead import).
`deriveDbcPoolAddress(quoteMint, baseMint, config)` matches spike-b L691 arg order
(itself `TODO verify`). Plausible; keep the flag. In trade.ts the import is unused
— remove it.

### P2-2 — DBC client singleton caches the first `Connection`
File: `apps/api/lib/launch.ts:312-318` (`_client` module singleton).
`dbcClient(conn)` memoizes on first call and ignores later `conn` args. Since
`getConnection()` is itself a singleton this is fine today, but if the connection
is ever reset (`resetConnection()`), launch keeps a stale client. graduation.ts
and fee-claim.ts correctly construct a fresh client per call. Low risk.
Fix: construct per-call (cheap) or key the cache on the connection.

### P2-3 — `claimPartnerTradingFee`/`claimCreatorTradingFee`/`claimPositionFee`/`migrateToDammV2` shapes all match spike-b verbatim — confirmed correct
Files: `fee-claim.ts:506-512, 542-548, 586-597`; `graduation.ts:375-382`.
- `claimPartnerTradingFee({ feeClaimer, payer, pool, maxBaseAmount, maxQuoteAmount })` ✓ (spike-b L590-596)
- `claimCreatorTradingFee({ creator, payer, pool, maxBaseAmount, maxQuoteAmount })` ✓ (spike-b L604-610)
- `claimPositionFee({ owner, position, pool, positionNftAccount, tokenAMint, tokenBMint, tokenAVault, tokenBVault, tokenAProgram, tokenBProgram })` ✓ (spike-b L629-641); `getTokenProgram(flag)` ✓
- `migrateToDammV2({ payer, pool, dammConfig })` → `{ transaction, firstPositionNftKeypair, secondPositionNftKeypair }` ✓ destructured correctly as partner/creator NFTs (spike-b L536-547); signers `[server, ephemeral(first), ephemeral(second)]` matches the proven multi-signer pattern.
No action — recorded as positive confirmation.

### P2-4 — Token-2022 harvest/withdraw instruction builders match spike-a's high-level actions (program id + sources)
File: `fee-claim.ts:473-485`.
spike-a used the high-level async actions; fee-claim uses the **instruction**
variants (server-signed, correct choice). `createHarvestWithheldTokensToMintInstruction(mint, sources[], programId)`
and `createWithdrawWithheldTokensFromMintInstruction(mint, destination, authority, multiSigners[], programId)`
are the correct token-2022 builders with `TOKEN_2022_PROGRAM_ID`. Program-id
selection via `tokenProgramId(token)` ✓. (See P0-1 for the authority-must-sign gate.)

### P2-5 — No `@solana/kit` / web3.js-v2 leakage anywhere
All five modules + routes import from `@solana/web3.js` (v1), `bn.js`,
`@solana/spl-token`, the Meteora v1 SDKs, `@streamflow/stream`, `@coral-xyz/anchor`.
No `@solana/kit`, no v2 `getXInstruction` kit-style calls. Vesting correctly uses
the Anchor `program.methods.createVestingEscrowV2(...).accounts(...).instruction()`
v1 path (NOT the kit `getCreateVestingEscrowV2Instruction` the jup-lock-starter
uses). Confirmed clean.

### P2-6 — lib/solana consumption (BuiltTx / signers / submit) is correct across all modules
- `BuiltTx { tx, signers, computeUnitLimit?, label? }` produced correctly; feePayer/blockhash left for submit() ✓ (launch, graduation, fee-claim, vesting all leave them unset; spike-c's manual blockhash/feePayer is NOT copied — correct).
- `serverSigner()` + `ephemeralSigner(kp)` composition matches `applySigners` expectations; ephemerals are the SDK-returned keypairs (config/baseMint/positionNFTs/metadata/base) ✓.
- `clientRelaySigner(userPubkey)` used for user swaps + recipient withdraw/cancel ✓; relay round-trips the opaque `idempotencyKey` blob verbatim (trade.ts submitTrade) ✓.
- Caller-supplied `idempotencyKey: graduate:migrate:<tokenId>` for the migrate (stable, blockhash-independent) ✓ — correct at-most-once anchor.
No action.

---

## Summary of must-fix before devnet/mainnet
1. **P0-1** gate withheld-claim on server-custodied withdraw authority (else unsignable tx). `fee-claim.ts:405-485`.
2. **P0-2** quote-mint ATA derived with hard-coded classic program → 0-amount fee mis-recording if quote ever non-classic. `fee-claim.ts:684,718,758`.
3. **P1-1..P1-8** verify against installed `.d.ts`/IDL: DBC TransferFeeConfig field names (BLOCKER), `cpAmm.swap`/`cpAmm.getQuote` (getQuote likely nonexistent), `client.pool.swapQuote` params, JupLock `claimV2`, Streamflow `prepareWithdraw/Cancel/Create` extParams.
4. **P1-9** drop invalid `label` from `submit()` options (compile error). `vesting/create/route.ts:172`.
