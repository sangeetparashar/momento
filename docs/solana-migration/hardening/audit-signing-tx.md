# Hardening audit — Transaction safety & signing (`apps/api/lib/solana/*.ts`)

> Adversarial correctness/security pass BEYOND the per-phase reviews
> (phase2 `REVIEW-*.md`, phase3 `REVIEW-*.md`). Focus: durable idempotency +
> fail-closed for treasury txns, blockhash expiry, fee-payer resolution,
> compute-budget/priority fee, Helius Sender + Jito tip, multi-signer
> `applySigners`, confirm/retry loop, error taxonomy, STUB safety, no top-level
> env/throws. Static review only (no network/tsc). Date: 2026-06-24.

Already-fixed items confirmed (NOT re-reported): durable Redis fail-closed for
server-signed broadcasts (`submit.ts:269-288`), STUB cannot sign live
(`serverWallet.ts:101-133`), swqos tip floor (`sender.ts:39-47`), import-safe lazy
env reads everywhere, blockhash-expiry guard via `getBlockHeight` vs
`lastValidBlockHeight`, relay blob carrying real `lvbh`/`pf`.

---

## P0

### P0-A — Idempotency reservation is NEVER released on a non-landing exit ⇒ a stable-key caller (rebate `rebate:<tradeId>`) is bricked for the full 10-min TTL and can never retry, and a confirmed-but-unrecorded tx can be re-issued by a later rebuild
**File:** `apps/api/lib/solana/submit.ts:306-325` (`reserve`), `:386-409` (throws), `:343-410` (no `try/finally`).
**Problem:** `submitSignedTail` does `store.reserve(key)` then has NO `try/finally`. On every
non-success exit — `BLOCKHASH_EXPIRED` (:389), `TIMEOUT` (:407), `RPC_ERROR` after all attempts
(:409), or `SIMULATION_FAILED` re-thrown from `confirmSignature` (:381) — the Redis key is left as
`RESERVED_MARKER` with no landed signature, and `store.put` is never called. Consequences:
  1. A caller that passes an **explicit, stable `idempotencyKey`** (exactly what phase3
     `REVIEW-security` P0-2 mandates for rebates: `rebate:<tradeId>`) can NEVER retry within the
     10-min TTL: the retry hits `reserve()` → false (:307), `get()` → null (marker, not a sig)
     (:308), and the code throws `DUPLICATE` (:321) instead of re-broadcasting the *same* signed tx.
     A single transient `TIMEOUT`/`RPC_ERROR` permanently blocks that rebate/claim until TTL expiry.
  2. The TIMEOUT comment (“idempotency guards re-issue”, :403-404) is wrong for the stable-key case:
     re-issue is *blocked*, not *guarded*. The tx may have landed; the system reports failure and
     leaves the key reserved-but-empty, so reconciliation can’t read a landed sig from the store.
**Fix:** Wrap the broadcast/confirm body in `try { … } finally { … }` and, on any exit WITHOUT a
recorded landed signature, RELEASE the reservation (`store.del(key)` — add `del` to the
`IdempotencyStore` interface + both impls) so an identical retry can re-broadcast. Distinguish
“broadcast happened, status unknown” (TIMEOUT/BLOCKHASH_EXPIRED with a `signature`) from
“never broadcast” (RPC_ERROR with no signature / SIMULATION_FAILED from preflight): on the former,
do NOT release — instead store the *unconfirmed signature* under the key so reconciliation/retry
can poll it (and a same-key retry returns it as `deduped`); on the latter, release so retry can
proceed. Never leave a bare `RESERVED_MARKER` behind on a thrown error.

---

## P1

### P1-B — `confirmSignature` ignores the requested `processed` commitment: a `processed`-target submit never confirms and is reported as TIMEOUT even though it landed
**File:** `apps/api/lib/solana/submit.ts:186`, `:202`.
**Problem:** `target = commitment === 'finalized' ? ['finalized'] : ['confirmed','finalized']`. When a
caller passes `commitment: 'processed'` (a valid `SubmitOptions.commitment`, types.ts:55), the target
set is `['confirmed','finalized']`, so a tx that has reached `processed` (but not yet `confirmed`)
is treated as not-confirmed; the poll deadline elapses and the tail re-broadcasts / ultimately
throws `TIMEOUT` (:407) for a tx that actually landed at the requested commitment. False-negative
confirmation on the money path → spurious retries and a TIMEOUT surfaced for a successful tx.
**Fix:** Build the acceptable set from the requested commitment: `processed →
['processed','confirmed','finalized']`, `confirmed → ['confirmed','finalized']`, `finalized →
['finalized']`.

### P1-C — Message-derived idempotency key embeds the LIVE priority-fee estimate, so two “same action” submits get DIFFERENT keys ⇒ message-derived at-most-once does NOT dedup logical retries (only an explicit key does)
**File:** `apps/api/lib/solana/submit.ts:423-428` (key derived AFTER `prependBudget`), `priorityFee.ts:82-84`.
**Problem:** `submit()` calls `prependBudget` (which fetches a fresh Helius
`getPriorityFeeEstimate`, varying call-to-call) and ONLY THEN derives the idempotency key from the
unsigned message (which now contains `setComputeUnitPrice(<live fee>)`). Two invocations of the
same logical action therefore compile DIFFERENT messages (different fee) ⇒ different sha256 keys ⇒
no dedup. The durable store only protects callers that pass an explicit `opts.idempotencyKey`. Any
treasury/server-signed caller that relies on the *default* message-derived key for cross-instance
at-most-once (the whole point of the fail-closed store) gets NONE. This is the structural reason
phase3 P0-2 needs `rebate:<tradeId>`; it generalizes to every server-signed path
(harvest/partner/creator claim, graduation migrate) that does not pass a stable key.
**Fix:** Derive the idempotency key from a STABLE pre-budget message (compile the message BEFORE
prepending compute-budget/tip ixs), or from `(label, feePayer, programIxsOnly)` excluding the
compute-budget/tip ixs. Document that server-signed callers MUST pass a stable, action-scoped
`idempotencyKey`; consider making it required (throw) for any `built.signers` containing
`privy-server` instead of silently falling back to the fee-variant message key.

### P1-D — Client-controlled relay blob drives the server’s expiry guard (`lvbh`) and reported fee (`pf`); a malicious/buggy client can disable the blockhash-expiry guard
**File:** `apps/api/lib/solana/submit.ts:528-555` (`decodeRelayBlob` → `tx.lastValidBlockHeight`).
**Problem:** `submitClientSigned` decodes `lvbh`/`pf` from the client-returned `idempotencyKey`
blob and assigns `tx.lastValidBlockHeight = carriedLvbh` (:550-551), which is the ONLY input to the
expiry guard (`submitSignedTail:388`). The blob is opaque but NOT authenticated (plain base64url
JSON, no HMAC). A client can set `lvbh` to a huge value to defeat the expiry guard, forcing the
server to re-broadcast a doomed tx for the full `maxRetries` loop, or set `k` to a colliding key.
Bounded by `maxRetries` (default 5) so it’s a minor resource-amplification, not fund loss — but the
server trusts client-supplied control data on a treasury-adjacent path (any `extraSigners` with a
`privy-server` co-sign makes it server-signed).
**Fix:** HMAC-sign the relay blob with a server secret and verify on return (reject tampered blobs),
OR re-derive `lvbh` server-side: the server already has `tx.recentBlockhash` from the deserialized
tx — look up its `lastValidBlockHeight` via `isBlockhashValid`/`getLatestBlockhash` at submit time
rather than trusting the carried number. At minimum, clamp `lvbh` to `currentHeight + 150`.

---

## P2

### P2-E — Re-broadcast loop re-confirms with a fixed 8s window regardless of `maxRetries`/blockhash window; a slow-confirming tx is re-broadcast even when already in-flight, and TIMEOUT is thrown while the blockhash is still valid
**File:** `apps/api/lib/solana/submit.ts:363` (`pollDeadline = now + RETRY_POLL_INTERVAL_MS*4`), loop `:351-401`.
**Problem:** Each attempt confirms for only ~8s then loops. With `DEFAULT_MAX_RETRIES_RPC = 5` and a
2s inter-attempt sleep, the total wall-clock confirm budget is ~5×(8+2) ≈ 50s, but a mainnet
blockhash is valid ~60-90s. So a tx that would confirm at ~60s is abandoned with `TIMEOUT` (:407)
even though its blockhash is still valid and it may still land — and the reservation is left dangling
(P0-A). The loop also re-broadcasts on every iteration regardless of whether the prior broadcast is
merely pending (harmless for `rpc`/`sender` re-send of the same signed bytes, but wasteful and, for
`sender`, re-submits a Jito tip each time).
**Fix:** Drive the confirm loop off the blockhash window (poll until `getBlockHeight >
lastValidBlockHeight`) rather than a fixed attempt count × 8s; only re-broadcast after a backoff,
and stop re-broadcasting once a `processed` status is seen. Keep `maxRetries` as a hard ceiling but
let the time budget track the real expiry.

### P2-F — `prependBudget` estimates the priority fee against a message that lacks the compute-budget ixs (and is recomputed/serialized twice)
**File:** `apps/api/lib/solana/submit.ts:158-165`.
**Problem:** The base64 passed to `getPriorityFeeEstimate` is serialized BEFORE the
compute-budget/tip ixs are prepended, so Helius estimates against an incomplete account set
(missing the ComputeBudget program + Jito tip transfer). Minor skew in the estimate; also the tx is
serialized here and again in `submitSignedTail` (`tx.serialize()`), and a third time for the relay
path. Cosmetic/perf, but the estimate basis is subtly wrong.
**Fix:** Estimate against the writable account keys (or accept the small skew explicitly); de-dup the
serialize calls.

### P2-G — No custody/allow-list check that the server wallet only co-signs sanctioned instruction shapes; `applySigners` will sign ANY tx a caller hands it with `serverSigner()`
**File:** `apps/api/lib/solana/signer.ts:24-37`, `submit.ts:433-436`.
**Problem:** The signing layer’s only treasury safeguard is the durable-store gate. There is no check
that a tx carrying a `privy-server` signer contains only expected programs/destinations. Any module
(or a future bug) that builds a `BuiltTx` with `serverSigner()` and an arbitrary transfer ix will get
the treasury signature applied. This is by-design layering (intent lives in the caller), but there is
no defense-in-depth at the signing boundary. The phase3 reviews flag the specific abusable callers
(vesting P0-3, rebate P0-1); the signing layer offers no backstop.
**Fix (defense-in-depth):** Optionally accept an allow-list of program ids / a max-lamport-transfer
ceiling on `BuiltTx` for `privy-server`-signed txns and assert it in `applySigners`/`submit` before
the server sign; at minimum, log the full ix program-id set + any SystemProgram transfer lamports for
every server-signed broadcast for audit.

---

## Notes (verified OK)
- `resolveFeePayer` (`submit.ts:124-132`): respects builder-set feePayer, else client-relay pubkey,
  else server wallet. Correct precedence; no path silently makes the treasury fee-payer for a client
  action.
- `applySigners` ephemeral re-attach + `PARTIAL_SIGN_UNSUPPORTED` (`signer.ts:105-167`): sound given
  the documented `TODO(verify-devnet)` (re-attached bytes valid only if Privy signs the SAME compiled
  message). This is a genuine DEVNET BLOCKER — cannot verify offline.
- `serverWallet.ts` live Privy wiring is `TODO(ops)` and throws `CONFIG_MISSING`/`STUBBED` at call
  time — DEVNET BLOCKER (ephemeral co-sign preservation), correctly left defensive.
