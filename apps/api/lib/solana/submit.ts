/**
 * submit() pipeline + client-relay entry points (§b.4 / D-signer §5).
 *
 * submit(built, opts):
 *   build (caller-supplied BuiltTx)
 *     -> Connection (Helius) + recent blockhash (lastValidBlockHeight)
 *     -> set feePayer (server wallet for platform; user pubkey for client actions)
 *     -> use built.computeUnitLimit, else DEFAULT_COMPUTE_UNIT_LIMIT
 *        (NOTE: no pre-flight simulation today — CU sizing via simulate is a
 *        TODO; callers should pass computeUnitLimit for tight CU provisioning)
 *     -> prepend ComputeBudget: setComputeUnitLimit + setComputeUnitPrice (priorityFee)
 *     -> [route==='sender'] prepend Jito tip transfer ix (sender.ts)
 *     -> applySigners(tx, signers)  (ephemerals first; server signs; ephemeral
 *        sigs re-attached + all required sigs verified afterward)
 *     -> idempotency: durable Redis store REQUIRED for server/treasury-signed
 *        txns (fail-closed if Upstash unconfigured) — reserve/get short-circuit
 *     -> self-submit:
 *          route 'rpc'    : Connection.sendRawTransaction(raw, { skipPreflight, maxRetries:0 })
 *          route 'sender' : POST Helius Sender (skipPreflight, maxRetries:0)
 *        bounded app-level retries while blockhash valid (WE own retry, not the RPC)
 *     -> confirm (getSignatureStatuses to commitment)
 *     -> record idempotency (key -> signature) + return SubmitResult
 *
 * Two relay entry points for the client-action path:
 *   buildUnsignedForClient(built)  -> { txBase64, idempotencyKey }
 *     (idempotencyKey is an OPAQUE blob carrying the real key + lastValidBlockHeight
 *      + applied priority fee; the client round-trips it back verbatim)
 *   submitClientSigned({ txBase64, idempotencyKey, extraSigners, opts }) -> SubmitResult
 *     (route 'sender' is forced to 'rpc' here: a client tx carries no Jito tip)
 *
 * IMPORT-SAFE: all env/network access is inside the exported functions.
 */

import { Transaction } from '@solana/web3.js';
import type { BlockhashWithExpiryBlockHeight } from '@solana/web3.js';
import type { BuiltTx, SubmitOptions, SubmitResult, Signer } from './types';
import { getConnection } from './connection';
import { applySigners } from './signer';
import { getServerWallet } from './serverWallet';
import {
  getPriorityFeeEstimate,
  computeBudgetIxs,
  DEFAULT_COMPUTE_UNIT_LIMIT,
} from './priorityFee';
import { sendViaSender, jitoTipIx, getDefaultTipLamports } from './sender';
import {
  getIdempotencyStore,
  setIdempotencyStore,
  deriveIdempotencyKey,
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from './idempotency';
import { SolanaTxError, classify } from './errors';

const DEFAULT_MAX_RETRIES_RPC = 5;
const RETRY_POLL_INTERVAL_MS = 2_000;

function isStub(): boolean {
  return process.env.STUB_SOLANA_SIGNER === '1';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize the UNSIGNED message (stable across retries) for idempotency derivation. */
function unsignedMessageB64(tx: Transaction): string {
  // compileMessage() requires feePayer + recentBlockhash to be set first.
  return tx.compileMessage().serialize().toString('base64');
}

/**
 * Relay opaque blob. buildUnsignedForClient returns this as `idempotencyKey`
 * (the §b.4 surface is unchanged — it stays a `string`), packing the real key
 * PLUS the build-time `lastValidBlockHeight` and `priorityFeeMicroLamports` so
 * submitClientSigned can confirm against the true expiry window (not 0) and
 * report the real applied fee (not 0). It is opaque to the client; the client
 * just round-trips it back to submitClientSigned.
 */
interface RelayBlob {
  /** the actual idempotency key (sha256 hex from deriveIdempotencyKey). */
  k: string;
  /** lastValidBlockHeight from getLatestBlockhash at build time. */
  lvbh: number;
  /** priority fee (micro-lamports/CU) actually baked into the budget ixs. */
  pf: number;
}

const RELAY_BLOB_PREFIX = 'v1:';

function encodeRelayBlob(blob: RelayBlob): string {
  return RELAY_BLOB_PREFIX + Buffer.from(JSON.stringify(blob), 'utf8').toString('base64url');
}

/**
 * Decode the opaque relay blob. Falls back to treating `value` as a bare
 * idempotency key (caller-supplied keys, or legacy callers) with no carried
 * metadata, so the public string contract stays backward compatible.
 */
function decodeRelayBlob(value: string): RelayBlob {
  if (value.startsWith(RELAY_BLOB_PREFIX)) {
    try {
      const json = Buffer.from(value.slice(RELAY_BLOB_PREFIX.length), 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<RelayBlob>;
      if (typeof parsed.k === 'string') {
        return {
          k: parsed.k,
          lvbh: typeof parsed.lvbh === 'number' ? parsed.lvbh : 0,
          pf: typeof parsed.pf === 'number' ? parsed.pf : 0,
        };
      }
    } catch {
      // fall through to bare-key handling
    }
  }
  return { k: value, lvbh: 0, pf: 0 };
}

/**
 * Resolve the fee payer for a built tx. If the builder already set `tx.feePayer`,
 * respect it. Otherwise: client-relay signer's pubkey (user action) wins, else
 * the server wallet (platform action).
 */
function resolveFeePayer(built: BuiltTx): void {
  if (built.tx.feePayer) return;
  const clientRelay = built.signers.find((s) => s.kind === 'client-relay');
  if (clientRelay) {
    built.tx.feePayer = clientRelay.publicKey;
    return;
  }
  built.tx.feePayer = getServerWallet().address;
}

/** Attach a fresh blockhash + lastValidBlockHeight if not already set. */
async function ensureBlockhash(tx: Transaction): Promise<BlockhashWithExpiryBlockHeight> {
  const conn = getConnection();
  const bh = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = bh.blockhash;
  tx.lastValidBlockHeight = bh.lastValidBlockHeight;
  return bh;
}

/**
 * Prepend compute-budget (+ optional Jito tip) instructions to `tx`.
 * Returns the priority fee actually applied (micro-lamports/CU) and the tip used.
 */
async function prependBudget(
  tx: Transaction,
  built: BuiltTx,
  opts: SubmitOptions,
): Promise<{ priorityFeeMicroLamports: number; jitoTipLamports?: number }> {
  const unitLimit = built.computeUnitLimit ?? DEFAULT_COMPUTE_UNIT_LIMIT;

  // Priority fee: explicit override, else Helius per-tx estimate from the message.
  let microLamports = opts.computeUnitPriceMicroLamports;
  if (microLamports == null) {
    // Estimate against the serialized (unsigned) message for a per-tx number.
    const txB64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    microLamports = await getPriorityFeeEstimate({
      transaction: txB64,
      priorityLevel: opts.priorityLevel,
    });
  }

  const budget = computeBudgetIxs(microLamports, unitLimit);

  let jitoTipLamports: number | undefined;
  const tipIxs = [];
  if (opts.route === 'sender') {
    jitoTipLamports = opts.jitoTipLamports ?? getDefaultTipLamports(opts.swqosOnly);
    tipIxs.push(jitoTipIx(jitoTipLamports));
  }

  // Prepend budget (+ tip) ahead of the program instructions.
  tx.instructions = [...budget, ...tipIxs, ...tx.instructions];
  return { priorityFeeMicroLamports: microLamports, jitoTipLamports };
}

/** Poll signature status until confirmed at `commitment` or the deadline passes. */
async function confirmSignature(
  signature: string,
  commitment: 'processed' | 'confirmed' | 'finalized',
  deadlineMs: number,
): Promise<{ confirmed: boolean; slot?: number }> {
  const conn = getConnection();
  const target = commitment === 'finalized' ? ['finalized'] : ['confirmed', 'finalized'];
  while (Date.now() < deadlineMs) {
    let statuses;
    try {
      statuses = await conn.getSignatureStatuses([signature], { searchTransactionHistory: false });
    } catch {
      await sleep(RETRY_POLL_INTERVAL_MS);
      continue;
    }
    const st = statuses?.value?.[0];
    if (st) {
      if (st.err) {
        throw new SolanaTxError('SIMULATION_FAILED', `Transaction failed on-chain: ${JSON.stringify(st.err)}`, {
          signature,
        });
      }
      if (st.confirmationStatus && target.includes(st.confirmationStatus)) {
        return { confirmed: true, slot: st.slot };
      }
    }
    await sleep(RETRY_POLL_INTERVAL_MS);
  }
  return { confirmed: false };
}

/**
 * Broadcast a fully-signed serialized tx once, via the chosen route.
 * Returns the signature (route 'rpc' returns it from sendRawTransaction; route
 * 'sender' from the Sender response).
 */
async function broadcastOnce(
  rawTx: Buffer,
  route: 'rpc' | 'sender',
  swqosOnly: boolean | undefined,
): Promise<string> {
  if (route === 'sender') {
    const { signature } = await sendViaSender({
      rawTxBase64: rawTx.toString('base64'),
      swqosOnly,
    });
    return signature;
  }
  // route 'rpc': WE own the resend loop, so skipPreflight + maxRetries:0.
  return getConnection().sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 });
}

/**
 * Shared submit tail: idempotency -> self-submit (bounded retries while the
 * blockhash is valid) -> confirm -> record. Assumes `tx` is fully signed and has
 * feePayer + blockhash set.
 */
async function submitSignedTail(
  tx: Transaction,
  blockhash: BlockhashWithExpiryBlockHeight,
  opts: SubmitOptions,
  meta: {
    route: 'rpc' | 'sender';
    priorityFeeMicroLamports: number;
    jitoTipLamports?: number;
    idempotencyKey: string;
    /**
     * True when this broadcast carries a server/treasury (Privy) signature. Such
     * txns MUST NOT be broadcast without a durable, cross-instance idempotency
     * store — a per-process Map risks serverless double-broadcast (double
     * fee-claim / double rebate). See REVIEW-security P0.
     */
    requiresDurableStore: boolean;
  },
): Promise<SubmitResult> {
  const { route, priorityFeeMicroLamports, jitoTipLamports, idempotencyKey, requiresDurableStore } =
    meta;
  const commitment = (opts.commitment ?? 'confirmed') as 'processed' | 'confirmed' | 'finalized';
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES_RPC;

  // FAIL-CLOSED (security P0): a server/treasury-signed broadcast requires the
  // durable Redis-backed store. If Upstash is not configured, getIdempotencyStore()
  // returns null and we refuse to broadcast rather than fall back to the
  // per-process Map (which cannot dedup across serverless instances/cold starts).
  // A dev/test Map may be installed explicitly via setIdempotencyStore().
  //
  // STUB MODE is dev/test by definition and never touches the network, so we
  // auto-install an in-process Map when none is configured — keeps stub builds
  // (ephemeral/client-relay only) running without Upstash.
  let store: IdempotencyStore | null = getIdempotencyStore();
  if (!store && isStub()) {
    store = new InMemoryIdempotencyStore();
    setIdempotencyStore(store);
  }
  if (!store) {
    if (requiresDurableStore) {
      throw new SolanaTxError(
        'CONFIG_MISSING',
        'Durable idempotency store unavailable (Upstash not configured): refusing to broadcast a ' +
          'server/treasury-signed transaction without cross-instance at-most-once protection. ' +
          'Set UPSTASH_REDIS_REST_URL/TOKEN, or install a store via setIdempotencyStore() for dev/test.',
      );
    }
    throw new SolanaTxError(
      'CONFIG_MISSING',
      'No idempotency store configured. Set UPSTASH_REDIS_REST_URL/TOKEN, or install one via ' +
        'setIdempotencyStore() for dev/test.',
    );
  }

  // Idempotency: short-circuit if a prior landed signature exists.
  const prior = await store.get(idempotencyKey);
  if (prior) {
    return {
      signature: prior,
      route,
      priorityFeeMicroLamports,
      jitoTipLamports,
      attempts: 0,
      idempotencyKey,
      deduped: true,
    };
  }

  // Reserve before first broadcast (atomic). If we can't reserve, another caller
  // is in-flight or it already landed — poll the store, then fall through.
  const reserved = await store.reserve(idempotencyKey);
  if (!reserved) {
    const landed = await store.get(idempotencyKey);
    if (landed) {
      return {
        signature: landed,
        route,
        priorityFeeMicroLamports,
        jitoTipLamports,
        attempts: 0,
        idempotencyKey,
        deduped: true,
      };
    }
    // Reserved-but-not-landed elsewhere: don't broadcast a competing tx.
    throw new SolanaTxError(
      'DUPLICATE',
      `Idempotency key ${idempotencyKey} is reserved and in-flight; not re-broadcasting`,
    );
  }

  // STUB MODE: return a synthetic result without touching the network. The tx is
  // already built/signed-as-far-as-possible; we just don't broadcast.
  if (isStub()) {
    const fakeSig = `STUB_${idempotencyKey.slice(0, 32)}`;
    await store.put(idempotencyKey, fakeSig);
    return {
      signature: fakeSig,
      route,
      priorityFeeMicroLamports,
      jitoTipLamports,
      attempts: 0,
      idempotencyKey,
      deduped: false,
    };
  }

  const rawTx = tx.serialize();
  const conn = getConnection();
  let attempts = 0;
  let lastErr: unknown;
  let signature: string | undefined;
  // True once we have recorded a (landed or unconfirmed-but-broadcast) signature
  // under the key, OR deliberately released the reservation. The finally block
  // uses this to guarantee we NEVER leave a bare RESERVED_MARKER on a thrown exit.
  let reservationSettled = false;

  // CRITICAL (idempotency P0): wrap broadcast/confirm in try/finally so the
  // reservation made above is ALWAYS settled on exit. Without this, any
  // non-success exit (SIMULATION_FAILED / BLOCKHASH_EXPIRED / TIMEOUT / RPC_ERROR)
  // would leave the key as RESERVED_MARKER with no landed sig: a stable-key caller
  // (rebate:<tradeId>, server-signed claim/graduation) could NEVER retry within
  // the 10-min TTL (reserve→false, get→null, throws DUPLICATE) — a single
  // transient timeout would permanently brick the rebate/claim.
  //
  // Settlement policy on a non-landing exit:
  //   - broadcast happened (we hold a `signature`): status is unknown (the tx may
  //     still land). Persist the unconfirmed sig under the key via put(): a retry
  //     returns it as deduped and reconciliation can poll it. We must NOT release
  //     and re-broadcast, which could double-issue a tx that actually landed.
  //   - never broadcast (`signature` undefined: RPC_ERROR with no sig, or a
  //     preflight SIMULATION_FAILED before any send): release the reservation via
  //     del() so an identical retry can reserve + re-broadcast.
  try {
    // App-level resend loop: re-send the SAME signed tx until it confirms or the
    // blockhash expires (lastValidBlockHeight passed). We own retry, not the RPC.
    while (attempts <= maxRetries) {
      attempts++;
      try {
        signature = await broadcastOnce(rawTx, route, opts.swqosOnly);
      } catch (err) {
        lastErr = err;
        // Transport hiccup — retry if we still have budget + valid blockhash.
      }

      if (signature) {
        // Confirm within the remaining blockhash window (~ up to ~90s on mainnet).
        // We poll status; if not confirmed before the next loop, we re-broadcast.
        const pollDeadline = Date.now() + RETRY_POLL_INTERVAL_MS * 4;
        const { confirmed, slot } = await confirmSignature(signature, commitment, pollDeadline);
        if (confirmed) {
          await store.put(idempotencyKey, signature);
          reservationSettled = true;
          return {
            signature,
            slot,
            route,
            priorityFeeMicroLamports,
            jitoTipLamports,
            attempts,
            idempotencyKey,
            deduped: false,
          };
        }
      }

      // Has the blockhash expired? If so, the caller must rebuild + retry.
      const currentHeight = await conn.getBlockHeight('confirmed').catch(() => null);
      if (
        currentHeight != null &&
        tx.lastValidBlockHeight != null &&
        currentHeight > tx.lastValidBlockHeight
      ) {
        throw new SolanaTxError(
          'BLOCKHASH_EXPIRED',
          `Blockhash expired before landing (height ${currentHeight} > ${tx.lastValidBlockHeight})`,
          { signature },
        );
      }

      if (attempts <= maxRetries) await sleep(RETRY_POLL_INTERVAL_MS);
    }

    // Exhausted retries. If we have a signature, status is unknown (TIMEOUT, not a
    // failure — the tx may still land; idempotency guards re-issue). Else RPC error.
    void blockhash;
    if (signature) {
      throw new SolanaTxError('TIMEOUT', 'Confirmation window elapsed; transaction status unknown', {
        signature,
      });
    }
    throw classify(
      lastErr ?? new SolanaTxError('RPC_ERROR', 'Failed to broadcast transaction after retries'),
    );
  } catch (err) {
    // confirmSignature throws SolanaTxError('SIMULATION_FAILED') on an on-chain
    // revert — that tx DID land (and failed), so the broadcast `signature` (if any)
    // is recorded by the finally as the dedup record; do NOT release it. Normalize
    // all other raw errors into the taxonomy here (replaces the inner classify()).
    throw classify(err);
  } finally {
    // Always settle the reservation so we never leave a bare marker on a thrown exit.
    if (!reservationSettled) {
      reservationSettled = true;
      try {
        if (signature) {
          // Broadcast happened, status unknown/failed — persist the sig so a retry
          // dedups to it and reconciliation can poll. (A confirmed-and-failed tx
          // also lands here; recording its sig prevents a message-derived rebuild
          // from re-issuing it.)
          await store.put(idempotencyKey, signature);
        } else {
          // Never broadcast — release so an identical retry can re-broadcast.
          await store.del(idempotencyKey);
        }
      } catch {
        // Best-effort: a store hiccup here at worst leaves the prior behavior
        // (marker until TTL); never mask the original error with a cleanup throw.
      }
    }
  }
}

/**
 * Full submit pipeline for a server-built tx (platform actions, and client txns
 * after the relay has reassembled them).
 */
export async function submit(built: BuiltTx, opts: SubmitOptions = {}): Promise<SubmitResult> {
  const route = opts.route ?? 'rpc';
  const tx = built.tx;

  resolveFeePayer(built);
  const blockhash = await ensureBlockhash(tx);

  const { priorityFeeMicroLamports, jitoTipLamports } = await prependBudget(tx, built, { ...opts, route });

  // Derive idempotency key from the UNSIGNED message (post-budget, pre-signature).
  const idempotencyKey =
    opts.idempotencyKey ??
    deriveIdempotencyKey(built.label ?? 'tx', tx.feePayer!.toBase58(), unsignedMessageB64(tx));

  // Apply all signers (ephemerals first, then server/client-relay). applySigners
  // re-attaches ephemeral signatures AFTER the Privy server sign (defensive against
  // Privy stripping pre-attached partial sigs) and verifies all required sigs.
  await applySigners(tx, built.signers);

  // A treasury/server-signed broadcast must have a durable idempotency store.
  const requiresDurableStore = built.signers.some((s) => s.kind === 'privy-server');

  return submitSignedTail(tx, blockhash, { ...opts, route }, {
    route,
    priorityFeeMicroLamports,
    jitoTipLamports,
    idempotencyKey,
    requiresDurableStore,
  });
}

/**
 * Relay step 1: server builds an unsigned tx for the CLIENT to sign.
 * Fills feePayer (= the user / client-relay signer), blockhash, and compute
 * budget. Any EPHEMERAL co-signers are partialSign'd BEFORE serialization so the
 * client only needs to add its own slot. Returns base64 tx + idempotency key.
 *
 * NOTE: route is forced to 'rpc' here for budget purposes (no Jito tip on the
 * client-build path); the actual submit route is decided in submitClientSigned.
 */
export async function buildUnsignedForClient(
  built: BuiltTx,
): Promise<{ txBase64: string; idempotencyKey: string }> {
  const tx = built.tx;
  resolveFeePayer(built);
  // Capture the REAL lastValidBlockHeight so submitClientSigned can confirm
  // against the true expiry window instead of defaulting to 0 (correctness P1).
  const blockhash = await ensureBlockhash(tx);

  // Capture the priority fee actually baked into the budget ixs so it can be
  // reported by submitClientSigned (telemetry P1) instead of 0. (§b.4 keeps this
  // entry point opts-free, so the Helius estimate / builder CU limit applies.)
  const { priorityFeeMicroLamports } = await prependBudget(tx, built, { route: 'rpc' });

  const key = deriveIdempotencyKey(
    built.label ?? 'tx',
    tx.feePayer!.toBase58(),
    unsignedMessageB64(tx),
  );

  // Pre-attach ephemeral signatures (Streamflow metadata / JupLock base) so the
  // client only adds its own. partialSign keeps the others' slots intact.
  const ephemerals = built.signers.filter((s) => s.kind === 'ephemeral');
  for (const s of ephemerals) await s.sign(tx);

  // Serialize WITHOUT requiring all signatures (the client supplies its own).
  const txBase64 = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');

  // Pack the real key + expiry height + applied fee into the opaque blob the
  // client round-trips back. The §b.4 return type is still { txBase64, idempotencyKey }.
  const idempotencyKey = encodeRelayBlob({
    k: key,
    lvbh: blockhash.lastValidBlockHeight,
    pf: priorityFeeMicroLamports,
  });

  return { txBase64, idempotencyKey };
}

/**
 * Relay step 2: the client returns its signed tx; the backend self-submits.
 * Deserializes the client-signed tx, applies any server/ephemeral signers still
 * owed (e.g. when a platform co-signature is required), then runs the submit
 * tail (idempotency -> self-submit -> confirm). This is the self-submit the
 * locked decision calls for (Privy cannot point at our Helius RPC).
 */
export async function submitClientSigned(input: {
  txBase64: string;
  idempotencyKey: string;
  extraSigners?: Signer[];
  opts?: SubmitOptions;
}): Promise<SubmitResult> {
  const { txBase64, idempotencyKey: idempotencyBlob, extraSigners = [], opts = {} } = input;

  // A client-built tx carries NO Jito tip (buildUnsignedForClient forces route
  // 'rpc' and never prepends jitoTipIx). If 'sender' is requested for a relayed
  // client tx, Helius Sender would reject it for a missing tip — so FORCE 'rpc'
  // and warn rather than land a guaranteed tip-too-low failure (sdk P1).
  let route = opts.route ?? 'rpc';
  if (route === 'sender') {
    // eslint-disable-next-line no-console
    console.warn(
      'submitClientSigned: route="sender" is not supported on the client-relay path ' +
        '(client-built tx carries no Jito tip); forcing route="rpc".',
    );
    route = 'rpc';
  }

  // Decode the opaque relay blob: real key + build-time lastValidBlockHeight +
  // applied priority fee. Falls back to a bare key for caller-supplied keys.
  const { k: idempotencyKey, lvbh: carriedLvbh, pf: carriedPriorityFee } =
    decodeRelayBlob(idempotencyBlob);

  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  if (!tx.feePayer) {
    throw new SolanaTxError('SIGNER_REJECTED', 'Client-signed tx is missing a feePayer');
  }
  if (!tx.recentBlockhash) {
    throw new SolanaTxError('BLOCKHASH_EXPIRED', 'Client-signed tx is missing a recentBlockhash');
  }

  // Apply any remaining server/ephemeral signers (e.g. a platform co-sign).
  // applySigners preserves the client's signature (partial-sign semantics) and
  // re-attaches ephemeral sigs if a server co-sign strips them.
  if (extraSigners.length > 0) {
    await applySigners(tx, extraSigners);
  }

  // Reconstruct the blockhash struct for the tail. A deserialized Transaction
  // does NOT carry lastValidBlockHeight (it's not on the wire), so prefer the
  // carried build-time value; defaulting to 0 would make the expiry guard fire on
  // the FIRST height check and kill legitimate submissions (correctness P1).
  const lastValidBlockHeight = tx.lastValidBlockHeight ?? carriedLvbh ?? 0;
  tx.lastValidBlockHeight = lastValidBlockHeight; // the tail reads tx.lastValidBlockHeight
  const blockhash: BlockhashWithExpiryBlockHeight = {
    blockhash: tx.recentBlockhash,
    lastValidBlockHeight,
  };

  // Report the REAL priority fee: a per-call override wins (note: it cannot
  // change the already-signed budget ix, so it is reported, not re-applied),
  // else the build-time fee carried in the blob (telemetry P1) — not 0.
  const priorityFeeMicroLamports = opts.computeUnitPriceMicroLamports ?? carriedPriorityFee;
  // route is forced to 'rpc' above, so there is no Jito tip on this path.
  const jitoTipLamports = undefined;

  // A platform co-signature (privy-server in extraSigners) makes this a
  // server/treasury-signed broadcast and demands the durable store.
  const requiresDurableStore = extraSigners.some((s) => s.kind === 'privy-server');

  return submitSignedTail(tx, blockhash, { ...opts, route }, {
    route,
    priorityFeeMicroLamports,
    jitoTipLamports,
    idempotencyKey,
    requiresDurableStore,
  });
}
