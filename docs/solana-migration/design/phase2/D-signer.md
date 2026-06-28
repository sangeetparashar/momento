# D — Server Signing + Transaction Submission Layer (`apps/api/lib/solana/*`)

**Status:** Design only. No code beyond this doc. (Phase 2 design; build lands in Phase 3.)
**Date:** 2026-06-24
**Owner module:** `apps/api/lib/solana/*`

> **Read first (grounding):** `research/04-wallet-auth-privy.md`, `research/16-solana-stack.md`;
> `scripts/spikes/spike-a-token2022-fee-rebate.ts`, `spike-b-meteora-dbc.ts`, `spike-c-vesting-lock.ts`
> + `scripts/spikes/README.md`. The web3.js v1 / Privy / Helius signatures used here are the **verified**
> ones from those spikes — this module REUSES them; it does not invent SDK surface.

---

## 0. Scope & locked decisions

This module is the single choke-point through which **every** Momento on-chain transaction is signed and
landed. It exists because there is **no server-side signing of any kind today** (`research/04` §4).

**LOCKED (do not relitigate here):**

- **Chain:** Solana-only. web3.js **v1 (1.98.x)** — Meteora/Streamflow/Privy are all v1; no `@solana/kit`.
- **Platform/treasury signer:** **Privy Server Wallets** via **`@privy-io/node`** (`@privy-io/server-auth@1.32.5`
  is deprecated; `lib/auth.ts` keeps using it for token verify until its own migration). Server wallet signs
  platform actions: mint, `createConfig`/`createPool`, `migrate`, claim fees, create vesting.
- **User actions:** the **client signs** via the Privy embedded wallet; the **backend self-submits** the signed
  tx through Helius (Privy server API exposes no custom-RPC field, so we never let Privy broadcast).
- **Submission:** self-submit through **Helius** — RPC `sendTransaction` (default) or **Helius Sender** (Jito
  dual-route) for launch/fee-claim txns. Priority fee from **Helius `getPriorityFeeEstimate`**; Sender path
  additionally requires a **Jito tip**.
- **Multi-signer:** a tx may carry an **extra ephemeral `Keypair`** (Streamflow `metadata`, Jupiter Lock `base`)
  alongside the Privy/server signer (`spike-c`, caveat #1). This module makes that a first-class abstraction.

**Token-2022 nuance (carried, not solved here):** amounts that land in a vesting/lock escrow are NET of the
transfer fee when the mint is a fee mint (`spike-c` caveat #2). That is a *callsite* sizing concern, not a
signer concern — the signer just signs whatever instructions it is handed.

---

## 1. File layout (`apps/api/lib/solana/`)

```
apps/api/lib/solana/
  index.ts          # barrel: re-exports the public interfaces + factories only
  types.ts          # cross-cutting TS interfaces (Signer, BuiltTx, SubmitResult, error taxonomy)
  connection.ts     # getConnection(): cached web3.js Connection from Helius RPC (reuses lib/helius config)
  serverWallet.ts   # ServerWallet abstraction over @privy-io/node (provision/identify + sign)
  signer.ts         # Signer interface + impls: PrivyServerSigner, ClientRelaySigner, EphemeralSigner; MultiSigner combiner
  priorityFee.ts    # getPriorityFeeEstimate (Helius) + ComputeBudget ix builders
  submit.ts         # submit() pipeline: build -> budget+fee -> [tip] -> self-submit -> confirm -> idempotency
  errors.ts         # SolanaTxError taxonomy + classify()
  sender.ts         # Helius Sender client (Jito tip route) — used by submit() when route === 'sender'
  idempotency.ts    # idempotency seam (in-memory default; pluggable store)
```

Everything is **import-safe with no live Privy creds**: factories lazily read env on first *use*, never at
module load (mirrors `lib/auth.ts` `getPrivy()` and `lib/helius.ts` `getHeliusConfig()`). `STUB_SOLANA_SIGNER=1`
swaps in stub signers so `tsc`, route imports, and unit tests compile/run with zero secrets.

---

## 2. Cross-cutting interfaces (`types.ts`) — what other modules import

These are the contracts the mint / pool / fee-claim / vesting modules (Phase 3) build against. Keep them stable.

```ts
import type {
  Transaction, PublicKey, Keypair, Connection, Commitment,
} from '@solana/web3.js';

/** A signer that can add its signature(s) to a v1 legacy Transaction. */
export interface Signer {
  /** The public key this signer signs as (the primary authority). */
  readonly publicKey: PublicKey;
  /** How this signer participates: server-held key, client-relayed, or ephemeral. */
  readonly kind: 'privy-server' | 'client-relay' | 'ephemeral';
  /**
   * Sign `tx` in place (or return a signed copy). For client-relay this is a no-op
   * marker — the client supplies the signature out-of-band (see ClientRelaySigner).
   * MUST NOT clear other parties' signatures (partial-sign semantics).
   */
  sign(tx: Transaction): Promise<Transaction>;
}

/** Output of a builder: an unsigned tx + every signer that must sign it. */
export interface BuiltTx {
  tx: Transaction;                 // feePayer + blockhash filled by submit(), not the builder
  signers: Signer[];               // primary signer(s) + any ephemeral co-signers (order-independent for legacy tx)
  /** Compute-unit ceiling hint; submit() refines via simulation if omitted. */
  computeUnitLimit?: number;
  /** Optional human label for logs/idempotency (e.g. 'mint', 'dbc.createPool', 'claimFees'). */
  label?: string;
}

export type SubmitRoute = 'rpc' | 'sender';     // 'sender' = Helius Sender (Jito dual-route)

export interface SubmitOptions {
  route?: SubmitRoute;             // default 'rpc'; launch/fee-claim use 'sender'
  priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax'; // Helius levels
  jitoTipLamports?: number;        // Sender only; default from env, min 0.0002 SOL (5_000 if swqos_only)
  swqosOnly?: boolean;             // Sender '?swqos_only=true' (cheaper tip, validators only)
  commitment?: Commitment;         // default 'confirmed'
  maxRetries?: number;             // app-level resubmits within blockhash validity; default 5 (rpc) / 0-handled (sender)
  idempotencyKey?: string;         // caller-supplied; else derived (see §6)
  computeUnitPriceMicroLamports?: number; // override the Helius estimate
}

export interface SubmitResult {
  signature: string;
  slot?: number;
  route: SubmitRoute;
  priorityFeeMicroLamports: number;
  jitoTipLamports?: number;
  attempts: number;
  idempotencyKey: string;
  deduped: boolean;                // true if returned from idempotency cache, not freshly landed
}
```

### Public factories (consumed by route handlers / Phase 3 modules)

```ts
// serverWallet.ts
export function getServerWallet(): ServerWallet;                 // Momento treasury signer (singleton)
// signer.ts
export function serverSigner(): Signer;                          // ServerWallet wrapped as a Signer
export function ephemeralSigner(kp?: Keypair): Signer;           // wraps a generated/passed Keypair (metadata/base)
export function clientRelaySigner(userPubkey: PublicKey): Signer;// placeholder for a tx the client will sign
// submit.ts
export function submit(built: BuiltTx, opts?: SubmitOptions): Promise<SubmitResult>;
export function buildUnsignedForClient(built: BuiltTx): Promise<{ txBase64: string; idempotencyKey: string }>;
export function submitClientSigned(input: {                      // relay: client returns its signed tx
  txBase64: string; idempotencyKey: string; extraSigners?: Signer[]; opts?: SubmitOptions;
}): Promise<SubmitResult>;
```

---

## 3. `ServerWallet` — abstraction over `@privy-io/node`

Wraps the **Momento treasury** Privy server wallet. Provision/identify it; sign a v1 `Transaction`.

```ts
export interface ServerWallet {
  readonly address: PublicKey;                     // resolved from env walletId on first use
  signTransaction(tx: Transaction): Promise<Transaction>;   // adds the treasury signature
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
}
```

**Identify (not auto-provision at runtime).** The treasury wallet is provisioned **once, by ops** (Phase 0.4),
and its `walletId` lives in env. The module *identifies* it by id; it does **not** create wallets on a hot path.

```ts
// serverWallet.ts (shape; live calls are TODO(ops))
function makeServerWallet(): ServerWallet {
  // lazy: read env on first method call, not at import
  let pubkey: PublicKey | null = null;
  function client() {
    const id = required('PRIVY_APP_ID'); const secret = required('PRIVY_APP_SECRET');
    const auth = required('PRIVY_AUTHORIZATION_KEY'); // signs server-wallet requests
    // TODO(ops): const privy = new PrivyClient({ appId: id, appSecret: secret, walletApi: { authorizationPrivateKey: auth } });
    // return privy.walletApi; // @privy-io/node wallet API
    throw stubGuard('serverWallet.client');
  }
  return {
    get address() { /* TODO(ops): privy.walletApi.getWallet(PRIVY_SERVER_WALLET_ID).address */ return (pubkey ??= stub()); },
    async signTransaction(tx) {
      // TODO(ops): const { signedTransaction } = await privy.walletApi.solana.signTransaction({
      //   walletId: PRIVY_SERVER_WALLET_ID, transaction: tx, /* caip2 cluster, NO custom-rpc field */ });
      // return signedTransaction;  // Privy signs; we self-submit elsewhere (research/16: no custom-RPC field)
      throw stubGuard('serverWallet.signTransaction');
    },
    async signAllTransactions(txs) { return Promise.all(txs.map(t => this.signTransaction(t))); },
  };
}
```

**Provisioning runbook (ops, out-of-band — referenced, not executed here):** create one server wallet +
authorization key in the Privy dashboard; record `PRIVY_SERVER_WALLET_ID`, `PRIVY_AUTHORIZATION_KEY`;
fund it with SOL for fees + Jito tips; pre-create its fee/position ATAs (cf. `scripts/create-fee-atas-send.ts`).

---

## 4. `Signer` implementations & the **MultiSigner** abstraction (CRUCIAL)

Three `Signer` kinds, one combiner. The combiner is what lets a single tx carry the Privy/server signer **plus**
an ephemeral `Keypair` (Streamflow `metadata` / JupLock `base`) — the exact pattern proven in `spike-c`
(`sendAndConfirmTransaction(connection, tx, [payer, metadata])`).

```ts
// PrivyServerSigner — kind 'privy-server'; delegates to ServerWallet.signTransaction
// EphemeralSigner   — kind 'ephemeral'; holds a local Keypair; sign() => tx.partialSign(kp)
// ClientRelaySigner — kind 'client-relay'; sign() is a NO-OP (the client adds the sig); publicKey = user wallet

/** Applies every signer to one tx. Privy/server signer(s) sign last so partialSign'd
 *  ephemeral signatures are preserved (legacy tx signatures are order-independent, but
 *  we keep a deterministic order for logging + to mirror the spike). */
export async function applySigners(tx: Transaction, signers: Signer[]): Promise<Transaction> {
  const ephemerals = signers.filter(s => s.kind === 'ephemeral');
  const others     = signers.filter(s => s.kind !== 'ephemeral');
  for (const s of ephemerals) await s.sign(tx); // local partialSign first
  for (const s of others)     await s.sign(tx); // privy-server (network) / client-relay (no-op)
  return tx;
}
```

### ⚠️ OPEN QUESTION (blocking for vesting/lock) — Privy + extra local signer

`spike-c` proves Streamflow/JupLock need a tx signed by **both** the sender **and** a freshly generated
ephemeral `Keypair`. With the **client embedded wallet** path the flow is: we `partialSign` the tx with the
ephemeral key locally, hand the partially-signed tx to the Privy client to add the sender signature, then
self-submit. With the **server wallet** path, Privy's `walletApi.solana.signTransaction` must **preserve**
signatures already present on the submitted tx (i.e. accept a partially-signed tx and only add its own slot).

> **OPEN:** Does `@privy-io/node` `signTransaction` accept and preserve a pre-attached ephemeral signature
> (partial-sign / multi-signer co-signing)? If it strips other signatures or rejects a partially-signed tx,
> the ephemeral key must sign **after** Privy returns (our `applySigners` order already supports "ephemeral
> then submit", but the server path returns a serialized tx — we must be able to `partialSign` the
> Privy-signed tx before broadcast). **Verify on devnet before building the vesting/lock module.**
> Fallback if Privy can't co-sign: route ephemeral-cosigned txns through the **client embedded wallet** only
> (client signs sender, we add ephemeral + self-submit), and keep server-wallet txns single-signer.

---

## 5. `submit()` pipeline (`submit.ts`)

```
build (caller-supplied BuiltTx)
  -> resolve Connection (Helius RPC) + recent blockhash (lastValidBlockHeight)
  -> set feePayer (server wallet for platform actions; user pubkey for client actions)
  -> simulate to size compute units (unless computeUnitLimit given)
  -> prepend ComputeBudget: setComputeUnitLimit + setComputeUnitPrice  (priorityFee.ts)
  -> [route==='sender'] append Jito tip transfer ix (sender.ts)
  -> applySigners(tx, built.signers)                      (§4)
  -> idempotency check (key) — short-circuit if already landed         (§6)
  -> self-submit:
        route 'rpc'    : connection.sendRawTransaction(raw, { skipPreflight:true, maxRetries:0 })
        route 'sender' : POST https://sender.helius-rpc.com/fast  (skipPreflight:true, maxRetries:0)
     bounded app-level retries while blockhash valid (we own retry, NOT the RPC)
  -> confirm (getSignatureStatuses / confirmTransaction to `commitment`)
  -> record idempotency (key -> signature) + return SubmitResult
```

**Why we own retries / `skipPreflight` / `maxRetries:0`:** per `research/16`, Helius Sender requires
`skipPreflight:true`, a priority fee, and `maxRetries:0`; we re-send the same signed tx ourselves until the
blockhash expires, polling status between sends. Same discipline on the plain RPC route for landing reliability.

**Two entry points for the relay (client-action path, `research/04` §2 server-builds-unsigned→client-signs):**

- `buildUnsignedForClient(built)` → fills feePayer=user, blockhash, compute budget; returns `{ txBase64, idempotencyKey }`.
  (Ephemeral co-signers, if any, are `partialSign`'d **before** serialization so the client only adds its slot.)
- `submitClientSigned({ txBase64, idempotencyKey, extraSigners })` → deserializes the client-signed tx, applies
  any server/ephemeral signers still owed, then runs the submit tail (idempotency → self-submit → confirm).
  This is the backend self-submit the locked decision calls for (Privy can't point at our Helius RPC).

---

## 6. Idempotency (`idempotency.ts`) — avoid double-submit

- **Key:** caller-supplied `idempotencyKey`, else derived = `sha256(label + feePayer + serialized message)` of the
  **unsigned message** (stable across retries; independent of the not-yet-present signatures).
- **Store seam:** `IdempotencyStore { get(key), put(key, signature), reserve(key): boolean }`. Default impl is an
  in-process `Map` with TTL (import-safe, no deps). **TODO(ops):** back it with the existing Postgres/Prisma or
  the rate-limit Redis (`lib/ratelimit`) so it survives serverless cold starts / multi-instance.
- **Flow:** `reserve(key)` before first broadcast (atomic). If already reserved+landed → return cached
  `SubmitResult{ deduped:true }`. If reserved but not yet landed (in-flight) → poll status rather than
  re-broadcasting a fresh blockhash. Critical for fee-claim/treasury actions that must never double-fire.

---

## 7. Priority fee + Jito tip (`priorityFee.ts`, `sender.ts`)

```ts
// priorityFee.ts — Helius Priority Fee API (research/16)
export async function getPriorityFeeEstimate(input: {
  transaction?: string;            // base64 serialized tx (preferred — per-tx estimate)
  accountKeys?: string[];          // fallback: writable accounts
  priorityLevel?: SubmitOptions['priorityLevel'];
}): Promise<number>; // micro-lamports / CU  -> ComputeBudgetProgram.setComputeUnitPrice
export function computeBudgetIxs(microLamportsPerCu: number, unitLimit: number): TransactionInstruction[];
```

- POSTs `getPriorityFeeEstimate` to the Helius RPC (reuse `lib/helius.ts` `rpcUrl`); feeds
  `ComputeBudgetProgram.setComputeUnitPrice` + `setComputeUnitLimit` (verified pattern, `research/16`).
- **Sender (`sender.ts`):** `POST https://sender.helius-rpc.com/fast` (regional variants overridable via env).
  Requires a **Jito tip** transfer ix to a tip account (min **0.0002 SOL**; **0.000005 SOL** with `?swqos_only=true`).
  Body sets `skipPreflight:true`, `maxRetries:0`. Tip amount/account from env with safe defaults.

---

## 8. Error taxonomy (`errors.ts`)

```ts
export type SolanaTxErrorCode =
  | 'CONFIG_MISSING'        // env/creds absent (no Privy/Helius config) — programmer/ops error, 500
  | 'STUBBED'              // STUB_SOLANA_SIGNER active and a live call was reached
  | 'SIGNER_REJECTED'      // Privy/server or client declined / authorization-key failure
  | 'PARTIAL_SIGN_UNSUPPORTED' // Privy stripped/blocked an ephemeral co-signer (the §4 open question, at runtime)
  | 'SIMULATION_FAILED'    // preflight/simulate revert (logs attached)
  | 'BLOCKHASH_EXPIRED'    // lastValidBlockHeight passed before landing — caller may rebuild+retry
  | 'INSUFFICIENT_FUNDS'   // fee payer lacks SOL for fees/tip/rent
  | 'TIP_TOO_LOW'          // Sender rejected: Jito tip under minimum
  | 'RPC_ERROR'            // transport / Helius RPC error
  | 'TIMEOUT'              // confirmation window elapsed, status unknown (do NOT assume failure)
  | 'DUPLICATE'            // idempotency: already submitted (carries the prior signature)
  | 'UNKNOWN';

export class SolanaTxError extends Error {
  code: SolanaTxErrorCode;
  retriable: boolean;       // BLOCKHASH_EXPIRED/RPC_ERROR/TIMEOUT(partial) => true
  signature?: string;       // set for DUPLICATE / TIMEOUT (status unknown)
  cause?: unknown;
}
export function classify(err: unknown): SolanaTxError; // maps web3.js/Helius/Privy errors into the taxonomy
```

`TIMEOUT` deliberately does **not** mean failure — the tx may still land; callers must check status / rely on
idempotency before re-issuing. Route handlers map `SolanaTxError` → the existing `{ success:false, error }`
JSON envelope used across `apps/api` (see `lib/auth.ts` guards, `wallet/send` responses).

---

## 9. Stubbable seam (import-safe, no live creds)

- No env read at module top-level; factories read on first call (matches `getPrivy()`/`getHeliusConfig()`).
- `STUB_SOLANA_SIGNER=1` → `getServerWallet()` returns a deterministic stub (fixed dummy pubkey,
  `signTransaction` throws `STUBBED` if a *live broadcast* is attempted but allows build/serialize paths for
  tests). `submit()` in stub mode returns a synthetic `SubmitResult` (no network).
- Every live Privy/Helius-Sender call is marked `// TODO(ops): <live call>` so the module **compiles and imports
  clean** under `tsc`/Next build with zero secrets, and Phase 3 route handlers can be wired against the
  interfaces before ops finishes provisioning.

---

## 10. Env vars

| Var | Used by | Notes |
|---|---|---|
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | `serverWallet.ts` | Already present for `lib/auth.ts`. |
| `PRIVY_AUTHORIZATION_KEY` | `serverWallet.ts` | **NEW.** Authorization private key that signs server-wallet API requests. Ops-provisioned. |
| `PRIVY_SERVER_WALLET_ID` | `serverWallet.ts` | **NEW.** Id of the provisioned Momento treasury wallet (identify, don't create at runtime). |
| `HELIUS_API_KEY` | `connection.ts`, `priorityFee.ts`, `sender.ts` | Already present (`lib/helius.ts`). |
| `SOLANA_RPC_URL` | `connection.ts` | Already present; falls back to Helius `rpcUrl` from `HELIUS_API_KEY`. |
| `SOLANA_NETWORK` | `connection.ts`, `serverWallet.ts` | `devnet` / `mainnet-beta` (caip2 cluster for Privy). |
| `HELIUS_SENDER_URL` | `sender.ts` | **NEW.** Default `https://sender.helius-rpc.com/fast`; regional override. |
| `JITO_TIP_LAMPORTS` | `sender.ts` | **NEW.** Default tip (min 200_000; 5_000 if `swqosOnly`). |
| `JITO_TIP_ACCOUNT` | `sender.ts` | **NEW.** Tip recipient account (rotate among Jito tip accounts). |
| `STUB_SOLANA_SIGNER` | all | **NEW.** `1` → stub mode (import-safe, no live calls). |

---

## 11. Consumers (Phase 3) & what they import

| Module | Imports | Signer(s) | Route |
|---|---|---|---|
| Token mint (Token-2022) | `serverSigner`, `submit` | server | `rpc` |
| Meteora DBC `createConfig`/`createPool`/`migrate` | `serverSigner`, `submit` | server | `sender` |
| Claim partner/creator fees | `serverSigner`, `submit` | server | `sender` |
| Streamflow vesting | `serverSigner`+`ephemeralSigner(metadata)`, `submit` | server + ephemeral | `sender` |
| Jupiter Lock LP lock | `serverSigner`+`ephemeralSigner(base)`, `submit` | server + ephemeral | `rpc`/`sender` |
| User send/swap (relay) | `buildUnsignedForClient` / `submitClientSigned` | client-relay (+ephemeral if any) | `rpc` |

---

## 12. Open questions (carry to Phase 3 build)

1. **Privy multi-signer (§4)** — does `@privy-io/node` preserve a pre-attached ephemeral signature? **Blocks
   vesting/lock.** Verify on devnet; fallback = client-embedded-wallet path for co-signed txns.
2. **Idempotency store** — Prisma table vs reuse rate-limit Redis. Decide before any treasury/fee-claim go-live.
3. **caip2 cluster string** for Privy server signing on devnet vs mainnet-beta — confirm exact value Privy expects.
4. **Compute-unit sizing** — trust Helius per-tx estimate vs always simulate first for large Meteora txns.
5. **Tip account rotation** — single `JITO_TIP_ACCOUNT` vs round-robin across the published Jito tip accounts.
