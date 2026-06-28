# D-VESTING — Phase 3A: Vesting (Streamflow) + Locks (Jupiter Lock)

> **Scope.** Design-only. Defines `apps/api/lib/vesting.ts` and three endpoints —
> `POST /api/vesting/create`, `GET /api/vesting/list`, `POST /api/vesting/[id]/withdraw` —
> for creator/team **vesting** (Streamflow, cliff+linear, cancelable) and LP/retained
> **locks** (Jupiter Lock, zero-fee). Momento is **Solana-only**, `@solana/web3.js` v1.
>
> **LOCKED upstream (do not re-litigate).** Vesting → Streamflow `@streamflow/stream@12.4.0`;
> LP/retained locks → Jupiter Lock (zero fee). Signing goes through the committed
> `apps/api/lib/solana/*` multi-signer flow (`applySigners` + `ephemeralSigner` for the
> ephemeral metadata/base co-signer). Token-2022 net-after-fee caveat applies to vested amounts.
>
> **Grounding (read + reuse — exact signatures):**
> - `apps/api/lib/solana/signer.ts` — `serverSigner`, `ephemeralSigner(kp?)`, `clientRelaySigner`, `applySigners`
> - `apps/api/lib/solana/submit.ts` — `submit`, `buildUnsignedForClient`, `submitClientSigned`
> - `apps/api/lib/solana/types.ts` — `Signer`, `BuiltTx`, `SubmitOptions`, `SubmitResult`
> - `apps/api/lib/solana/serverWallet.ts` — treasury Privy server wallet (`TODO(verify-devnet)` co-sig)
> - `apps/api/prisma/schema.prisma` — `VestingSchedule`, enums `VestingProvider {STREAMFLOW, JUP_LOCK}`, `VestingStatus {PENDING, ACTIVE, PAUSED, COMPLETED, CANCELED}`
> - `scripts/spikes/spike-c-vesting-lock.ts` — Streamflow `prepareCreateInstructions` → `{ixs, metadata, metadataPubKey}`; Jupiter Lock `createVestingEscrowV2` (ephemeral `base`); withdraw/cancel/getOne
> - `docs/solana-migration/research/13-streamflow.md`; `design/phase2/{D-api.md §3.4, SPEC.md §10, CONTRACTS.md a.10}`

---

## 0. Conventions (inherited from D-api §0)

- App Router handlers (`export async function GET/POST(request: NextRequest)`).
- Envelope `{ success: true, data }` / `{ success: false, error }`. Validation via
  `validateBody(schema, body)` → `400 "Validation error: <path>: <msg>"`.
- Auth via `lib/auth.ts`: `requireCreator` (create), `requireAuth` (list, withdraw).
- All on-chain amounts are **base-unit strings**; unix times are `number` (seconds); bps are `number`.
- Wallet gating: reject `pending-` wallets via `getWalletForChain(user)` → `400 "Wallet not ready"`.
- Idempotency is owned by `submit()` (durable Redis store required for server-signed txns);
  the DB row is keyed on natural unique columns (`streamId`, `createSignature`).

---

## 1. Provider routing (which protocol per request)

`lib/vesting.ts` picks the provider from the **intent**, not a client flag, and persists it
as `VestingSchedule.provider`:

| Intent | Provider | Why | Cancelable | Recipient |
|---|---|---|---|---|
| Creator / team allocation **vesting** | `STREAMFLOW` | cliff+linear, cancelable-by-sender (claw back unvested if a member leaves), flat ~0.17 SOL fee | `cancelableBySender=true` | creator/team wallet |
| LP / retained-allocation **lock** | `JUP_LOCK` | **zero fee** (Streamflow Token-Lock charges 0.5% of tokens) | `cancelMode=0` (irreversible) | treasury / self |

`POST /api/vesting/create` accepts an explicit `kind: 'vesting' | 'lock'` (default `'vesting'`);
`kind` maps 1:1 to provider. This keeps the two fee/behavior profiles unambiguous and matches
research/13 §0 + §5.

---

## 2. `lib/vesting.ts` — interface

All builders return a `BuiltTx` (from `lib/solana/types.ts`) — they **never** set feePayer or
blockhash (that is `submit()`/`buildUnsignedForClient()`'s job) and they attach the right
`Signer[]`. Amounts cross the boundary as base-unit strings; conversion to `BN` is internal.

```ts
import type { BuiltTx } from '../solana/types';
import type { VestingProvider, VestingStatus } from '@prisma/client';

export type VestingKind = 'vesting' | 'lock';

/** Normalized create request (post-Zod). Times are unix seconds; amounts base-unit strings. */
export interface VestingCreateInput {
  kind: VestingKind;                 // 'vesting' -> STREAMFLOW, 'lock' -> JUP_LOCK
  tokenId: string;                   // CreatorToken.id (DB) — resolves mint + decimals + ownership
  mint: string;                      // token mint (must match CreatorToken.mintAddress)
  recipient: string;                 // beneficiary wallet (vesting); treasury/self (lock)
  amountBase: string;                // GROSS amount to deposit (base units) — see §6 T22 caveat
  startAt: number; cliffAt: number; endAt: number;  // unix seconds; cliffAt>=startAt; endAt>cliffAt
  unlockEvery: number;               // period seconds (linear tick); endAt-cliffAt must be a multiple
  cliffAmountBase?: string;          // released at cliff; default "0" (pure linear)
}

/** What the builder emits + what the route persists. */
export interface VestingPlan {
  provider: VestingProvider;
  /** Streamflow metadata pubkey OR Jup-Lock escrow PDA — the on-chain stream/escrow id. */
  streamId: string;
  /** ephemeral co-signer pubkey (metadata for Streamflow, base for Jup-Lock) — for logging. */
  ephemeralPubkey: string;
  /** NET amount that will actually land in escrow after any Token-2022 transfer fee (§6). */
  netDepositBase: string;
  built: BuiltTx;
}

/** Build a Streamflow vesting stream create tx (cliff+linear, cancelableBySender=true). */
export function buildStreamflowCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;

/** Build a Jupiter Lock createVestingEscrowV2 tx (ephemeral base; cancelMode=0). */
export function buildJupiterLockCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;

/** Dispatch on input.kind. */
export function buildVestingCreate(input: VestingCreateInput, payer: PublicKey): Promise<VestingPlan>;

/** Build a recipient-signed withdraw/claim tx. invoker MUST be the recipient (§4). */
export function buildVestingWithdraw(args: {
  schedule: VestingSchedule;         // DB row (provider, streamId, mint)
  invoker: PublicKey;                // = recipient wallet
  amountBase?: string;               // default: full claimable now
}): Promise<{ built: BuiltTx; claimableBase: string }>;

/** Build a sender-signed cancel tx (Streamflow only; JUP_LOCK cancelMode=0 => not cancelable). */
export function buildVestingCancel(args: {
  schedule: VestingSchedule;
  invoker: PublicKey;                // = original sender / treasury
}): Promise<{ built: BuiltTx }>;

/** Read live on-chain state (claimable / withdrawn / status) for list + withdraw. */
export function getVestingState(schedule: VestingSchedule): Promise<{
  totalBase: string; withdrawnBase: string; claimableBase: string;
  status: VestingStatus;
}>;
```

### 2.1 Streamflow builder internals (reuse spike-c exact signatures)

```ts
import { StreamflowSolana, getBN, ICluster } from '@streamflow/stream';
import { ephemeralSigner, serverSigner } from '../solana/signer';

const client = new StreamflowSolana.SolanaStreamClient(RPC_URL, ICluster.Devnet, 'confirmed');
// VERIFIED return shape (spike-c L379-385, research/13 §2): { ixs, metadata?: Keypair, metadataPubKey }
const { ixs, metadata, metadataPubKey } =
  await client.prepareCreateInstructions(createData, { sender: { publicKey: payer } });
// createData: { recipient, tokenId: mint, start, amount(BN), period: unlockEvery, cliff,
//   cliffAmount(BN), amountPerPeriod(BN = (amount - cliffAmount)/numPeriods), name,
//   canTopup:false, cancelableBySender:true, cancelableByRecipient:false,
//   transferableBySender:false, transferableByRecipient:false, automaticWithdrawal:false,
//   tokenProgramId: <TOKEN_2022 for T22 mints — §6> }
if (!metadata) throw new SolanaTxError('SIGNER_REJECTED', 'no ephemeral metadata keypair');

const tx = new Transaction().add(...ixs);
const built: BuiltTx = {
  tx,
  signers: [serverSigner(), ephemeralSigner(metadata)],  // primary path (§3)
  label: 'vest_create',
};
// streamId = metadataPubKey.toBase58()
```

`amountPerPeriod = (amount − cliffAmount) / numPeriods`, `numPeriods = (endAt − cliffAt) /
unlockEvery` (validated integral in Zod, §5). Withdraw/cancel use
`client.prepareWithdrawInstructions({ id, amount }, { invoker: { publicKey } })` and the cancel
equivalent (research/13 §2: `withdraw`/`cancel` need only the invoker signer — **no** ephemeral
co-signer), then wrap as a `BuiltTx`. `getVestingState` ← `client.getOne({ id: streamId })`
(`stream.unlocked(now)` − `withdrawnAmount`).

### 2.2 Jupiter Lock builder internals (Anchor over the IDL — spike-c §4)

```ts
const base = Keypair.generate();                          // ephemeral co-signer
const [escrow] = PublicKey.findProgramAddressSync(
  [Buffer.from('escrow'), base.publicKey.toBuffer()], JUP_LOCK_PROGRAM_ID);  // LocpQguc...
// program.methods.createVestingEscrowV2(lockParams, { slices: [] })
//   .accounts({ base: base.publicKey, senderToken, escrowToken, recipient, tokenMint: mint,
//     sender: payer, tokenProgram, systemProgram, escrow })
const built: BuiltTx = { tx, signers: [serverSigner(), ephemeralSigner(base)], label: 'lock_create' };
// streamId = escrow.toBase58();  cancelMode=0 (irreversible) => buildVestingCancel rejects JUP_LOCK
```

`getVestingState` ← `program.account.vestingEscrow.fetch(escrow)`. Pin the program id +
IDL; the jup-lock **test** id `2r5Vek…` is localnet only. **TODO(verify-devnet):** confirm
`createVestingEscrowV2` account/arg names against the fetched devnet IDL (spike-c L530).

---

## 3. Signer / fallback design (the crux — SPEC §10 open question)

Both create txns are **two-signer**: a primary signer (Privy) + an ephemeral co-signer (the
Streamflow `metadata` Keypair / Jup-Lock `base` Keypair) whose account is being created, so it
must consent. This is exactly the case `applySigners` was built for.

### 3.1 PRIMARY path — server wallet + `applySigners` re-attach

Platform-issued grants are signed by the **treasury server wallet** (`serverSigner()`), with the
ephemeral co-signer as `ephemeralSigner(metadata|base)`. Call `submit(built, { route: 'rpc',
label })`. Inside, `applySigners` (signer.ts L105):

1. ephemerals `partialSign` first; snapshot their signatures,
2. server signer runs (Privy network call),
3. **re-attaches** any ephemeral sig the Privy sign stripped (`tx.addSignature`),
4. throws `PARTIAL_SIGN_UNSUPPORTED` if an ephemeral sig is still missing.

Because a server signature is present, `submit()` requires the **durable Redis idempotency
store** (fail-closed) — correct for an at-most-once stream create.

### 3.2 FALLBACK path — client embedded-wallet co-sign (on `PARTIAL_SIGN_UNSUPPORTED`)

If Privy `@privy-io/node signTransaction` strips/over-mutates the pre-attached ephemeral sig
(SPEC §10 / signer.ts + serverWallet.ts `TODO(verify-devnet)`), `applySigners` raises
`PARTIAL_SIGN_UNSUPPORTED`. The route then **falls back to the client-relay flow**, where the
**creator's embedded wallet** is the primary signer instead of the treasury:

```ts
// fallback build: signers = [ephemeralSigner(metadata|base), clientRelaySigner(creatorWallet)]
const { txBase64, idempotencyKey } = await buildUnsignedForClient(fallbackBuilt);
// buildUnsignedForClient (submit.ts L478) pre-attaches the ephemeral partialSign,
// serializes requireAllSignatures:false; the client adds only its own slot, then POSTs back
// to submitClientSigned({ txBase64, idempotencyKey }) which self-submits.
```

This sidesteps Privy server co-signing entirely: the ephemeral sig is attached **server-side
before** serialization, the client supplies the single remaining slot. The create response
carries a `signMode: 'server' | 'client'` discriminator so mobile knows whether a tx came back
to sign (client) or the platform already submitted (server).

**Decision rule (one line):** try server path; on `PARTIAL_SIGN_UNSUPPORTED` (or the configured
`VESTING_FORCE_CLIENT_COSIGN=1` override after devnet proves Privy strips), build the
client-relay tx and return `transaction` for the creator to sign.

**TODO(verify-devnet):** prove on devnet whether `@privy-io/node signTransaction` (a) preserves
a pre-attached ephemeral partial sig and (b) signs the *same* compiled message (no blockhash/ix
mutation that invalidates a re-attached captured sig — signer.ts L126 note). The outcome flips
the default path. **This is the single gating item before the vesting module is built.**

### 3.3 Withdraw / cancel signers

Withdraw and cancel are **single-signer** (no ephemeral account is created). Withdraw's invoker
**must be the recipient**; cancel's invoker **must be the original sender/treasury**. These run
through the client-relay path by default (the recipient/creator signs with their embedded
wallet) — no server co-sig, no `PARTIAL_SIGN_UNSUPPORTED` risk. A treasury-cancel of a
platform-issued grant may instead use `serverSigner()` + `submit()` directly.

---

## 4. Endpoints

### 4.1 `POST /api/vesting/create` — **Creator**

Limiter `writeLimiter`. Lib `vesting.ts`. `requireCreator(request)`; `getWalletForChain` gate.
Validate `vestingCreateSchema`. Verify the caller **owns `tokenId`** (`CreatorToken.userId ===
user.id`) and `mint === token.mintAddress`. Build via `buildVestingCreate`. Persist a
`VestingSchedule` row `status=PENDING` (`provider`, `streamId`, `tokenMint`, `totalBaseUnits`,
`beneficiaryWallet=recipient`, `beneficiaryUserId` if resolvable, `cliffSeconds`,
`durationSeconds`, `startAt/cliffAt/endAt`). Then:

- **server path:** `submit()` → on confirm set `status=ACTIVE`, `createSignature=sig`.
- **client path:** `buildUnsignedForClient()` → return `transaction`; row stays `PENDING` until
  mobile self-submits and POSTs `/api/wallet/transactions/log` (`type: 'vest_create'`), which
  flips `ACTIVE` + sets `createSignature`.

```jsonc
// req (Zod vestingCreateSchema)
{ "kind": "vesting", "tokenId": "ct_…", "mint": "Hxk…", "recipient": "9aZ…",
  "amountBase": "50000000000", "startAt": 1719000000, "cliffAt": 1726000000,
  "endAt": 1750000000, "unlockEvery": 86400, "cliffAmountBase": "0" }
// res
{ "success": true, "data": {
  "vestingId": "vs_…", "provider": "STREAMFLOW", "streamId": "<metadataPubkey|escrowPDA>",
  "signMode": "client",                       // "server" => already submitted
  "transaction": "<base64-unsigned>",         // present only when signMode="client"
  "createSignature": null,                     // set when signMode="server"
  "netDepositBase": "48000000000" } }          // < amountBase if T22 fee (§6)
```

### 4.2 `GET /api/vesting/list` — **User**

Limiter `readLimiter`. `requireAuth`. `?role=recipient` (default) | `sender`; optional `?mint=`.
Query `VestingSchedule` where `beneficiaryUserId=user.id` / `beneficiaryWallet=wallet`
(recipient) or owned-token sender side; enrich each with live `getVestingState` (batched, short
cache). Returns the D-api §3.4 shape (`vestingId, mint, symbol, role, totalBase, withdrawnBase,
claimableBase, cliffAt, endAt, status`).

### 4.3 `POST /api/vesting/[id]/withdraw` — **User (recipient)**

Limiter `writeLimiter`. `requireAuth`. Load the `VestingSchedule` by `id`; **authorize: caller’s
wallet must equal `beneficiaryWallet`** (recipient-only — the recipient must sign). `400 "Nothing
to withdraw"` if `claimableBase=0`. `buildVestingWithdraw({ schedule, invoker: recipientWallet })`
→ `buildUnsignedForClient()` (recipient signs via embedded wallet). On the logged confirm, bump
`releasedBaseUnits`; set `status=COMPLETED` when fully released.

```jsonc
// req {}  (id in path)
// res { "success": true, "data": { "transaction": "<base64-unsigned>",
//        "claimableBase": "3000000000" } }
```

> No `cancel` endpoint is in this module’s scope (D-api §3.4 lists only create/list/withdraw).
> `buildVestingCancel` is exposed in `lib/vesting.ts` for an internal/admin treasury-claw-back
> path (Streamflow only) and is wired by a later admin route; `JUP_LOCK` rejects cancel.

---

## 5. Validation (`vestingCreateSchema`, `vestingWithdrawSchema`)

`vestingCreateSchema`: `kind` enum; `tokenId`/`mint`/`recipient` base58 strings; `amountBase`/
`cliffAmountBase` positive base-unit strings (`/^\d+$/`); `startAt/cliffAt/endAt` ints with
`cliffAt>=startAt`, `endAt>cliffAt`, `startAt > now − skew`; `unlockEvery` positive int with
`(endAt − cliffAt) % unlockEvery === 0` and `(amountBase − cliffAmountBase)` divisible by
`numPeriods` (Streamflow rejects non-integral `amountPerPeriod`). `vestingWithdrawSchema`: empty
body (id in path), optional `amountBase`.

---

## 6. Token-2022 net-after-fee (LOCKED caveat)

If the creator mint carries a Token-2022 transfer fee (spike-a), depositing `amountBase`
transfers gross but the escrow receives `amountBase × (1 − feeBps/10_000)` — the schedule then
vests/locks the **net**, silently short-changing the recipient.

**Recommendation (in priority order):**
1. **Vest a classic SPL allocation where possible** — the creator/team allocation can be held in
   a classic-SPL sibling or the fee carve-out can exempt the treasury (Token-2022
   transfer-fee config can whitelist via the fee authority); deposit then incurs no haircut.
   This keeps the math exact and is the spike-c default (classic mint).
2. **Otherwise gross-up:** set deposit `= ceil(targetNet × 10_000 / (10_000 − feeBps))` so the
   net landing equals the intended `targetNet`. `buildVestingCreate` computes `netDepositBase`
   and returns it; the route persists `totalBaseUnits = netDepositBase` (what actually vests),
   not the gross deposit, so list/withdraw math is honest.

Pass `tokenProgramId = TOKEN_2022_PROGRAM_ID` to Streamflow / use the T22 token program in the
Jup-Lock accounts for T22 mints. **TODO(verify-devnet):** confirm both SDKs create the escrow ATA
under the correct token program and that Streamflow’s `amount` is interpreted as gross-deposit
(not net) for T22 — re-verify on devnet with the exact mint extensions (research/13 §8.2).

---

## 7. Persistence map (`VestingSchedule`, no schema change)

| Field | Source |
|---|---|
| `provider` | `kind` → `STREAMFLOW` / `JUP_LOCK` |
| `streamId` | metadataPubKey (Streamflow) / escrow PDA (Jup-Lock) — unique |
| `tokenId` / `tokenMint` | request (ownership-verified) |
| `totalBaseUnits` | `netDepositBase` (§6) |
| `releasedBaseUnits` | bumped on each withdraw log |
| `beneficiaryWallet` / `beneficiaryUserId` | `recipient` (+ resolved User) |
| `cliffSeconds` / `durationSeconds` | `cliffAt−startAt` / `endAt−startAt` |
| `startAt/cliffAt/endAt` | request |
| `status` | `PENDING`→`ACTIVE` (create confirm) →`COMPLETED`/`CANCELED` |
| `createSignature` / `cancelSignature` | confirmed sigs (unique) |

---

## 8. Cross-module dependencies

- **`apps/api/lib/solana/*` (Phase 2, committed):** `serverSigner`/`ephemeralSigner`/
  `clientRelaySigner`/`applySigners` (signer.ts), `submit`/`buildUnsignedForClient`/
  `submitClientSigned` (submit.ts), `getServerWallet` (serverWallet.ts), `SolanaTxError`/
  `BuiltTx`/`Signer`. **Hard dependency on the SPEC §10 devnet outcome** (Privy ephemeral
  co-sig) — picks §3.1 vs §3.2 as default.
- **`lib/auth.ts`:** `requireCreator`, `requireAuth`, `getWalletForChain`.
- **`lib/validation.ts`:** add `vestingCreateSchema`, `vestingWithdrawSchema`.
- **`lib/prisma.ts` / schema:** `VestingSchedule` + enums (no migration needed).
- **`wallet/transactions/log`:** consumes `type: 'vest_create' | 'vest_withdraw'` to flip
  `status`/`createSignature`/`releasedBaseUnits` on client-path confirms (D-api §3 preamble).
- **Launch module (`lib/launch.ts`, sibling Phase 3):** supplies the creator/team & LP
  allocation amounts + mint/decimals + Token-2022 fee config this module vests/locks; the LP
  lock recipient is the treasury position holder set by launch. Ordering: launch → vesting.
- **Fees module (`lib/fees.ts`):** independent, but shares the Token-2022 fee-config read used
  for §6 gross-up.
- **External SDKs (new deps):** `@streamflow/stream@12.4.0` (pulls web3.js v1 — aligned),
  `@coral-xyz/anchor` + pinned Jupiter Lock IDL/program id `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`.

---

## 9. Open items / TODO(verify-devnet)

1. **Privy ephemeral co-sig (SPEC §10 — gating).** Does `@privy-io/node signTransaction`
   preserve a pre-attached ephemeral partial sig and sign the same compiled message? Decides
   §3.1 vs §3.2 default. Must be proven before build.
2. **Jupiter Lock IDL/account names** for `createVestingEscrowV2` against the devnet program.
3. **Token-2022 deposit semantics** — gross vs net interpretation in both SDKs; escrow ATA under
   correct token program; gross-up rounding.
4. **Streamflow fee budget** — ~0.16 SOL/contract paid by the signer (treasury or creator);
   surface it in the create response/UX.
