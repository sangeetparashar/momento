/**
 * submit() pipeline + client-relay entry points (§b.4 / D-signer §5).
 *
 * submit(built, opts):
 *   build (caller-supplied BuiltTx)
 *     -> Connection (Helius) + recent blockhash (lastValidBlockHeight)
 *     -> set feePayer (server wallet for platform; user pubkey for client actions)
 *     -> [simulate to size compute units unless computeUnitLimit given]
 *     -> prepend ComputeBudget: setComputeUnitLimit + setComputeUnitPrice (priorityFee)
 *     -> [route==='sender'] prepend Jito tip transfer ix (sender.ts)
 *     -> applySigners(tx, signers)             (ephemerals first; server last)
 *     -> idempotency reserve/get — short-circuit if already landed
 *     -> self-submit:
 *          route 'rpc'    : Connection.sendRawTransaction(raw, { skipPreflight, maxRetries:0 })
 *          route 'sender' : POST Helius Sender (skipPreflight, maxRetries:0)
 *        bounded app-level retries while blockhash valid (WE own retry, not the RPC)
 *     -> confirm (getSignatureStatuses to commitment)
 *     -> record idempotency (key -> signature) + return SubmitResult
 *
 * Two relay entry points for the client-action path:
 *   buildUnsignedForClient(built)  -> { txBase64, idempotencyKey }
 *   submitClientSigned({ txBase64, idempotencyKey, extraSigners, opts }) -> SubmitResult
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
import { getIdempotencyStore, deriveIdempotencyKey } from './idempotency';
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
  },
): Promise<SubmitResult> {
  const { route, priorityFeeMicroLamports, jitoTipLamports, idempotencyKey } = meta;
  const commitment = (opts.commitment ?? 'confirmed') as 'processed' | 'confirmed' | 'finalized';
  const maxRetries = opts.maxRetries ?? (route === 'rpc' ? DEFAULT_MAX_RETRIES_RPC : DEFAULT_MAX_RETRIES_RPC);

  const store = getIdempotencyStore();

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
      try {
        const { confirmed, slot } = await confirmSignature(signature, commitment, pollDeadline);
        if (confirmed) {
          await store.put(idempotencyKey, signature);
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
      } catch (err) {
        // On-chain failure (SIMULATION_FAILED) is terminal — don't resend.
        throw classify(err);
      }
    }

    // Has the blockhash expired? If so, the caller must rebuild + retry.
    try {
      const currentHeight = await conn.getBlockHeight('confirmed');
      if (tx.lastValidBlockHeight != null && currentHeight > tx.lastValidBlockHeight) {
        throw new SolanaTxError(
          'BLOCKHASH_EXPIRED',
          `Blockhash expired before landing (height ${currentHeight} > ${tx.lastValidBlockHeight})`,
          { signature },
        );
      }
    } catch (err) {
      if (err instanceof SolanaTxError && err.code === 'BLOCKHASH_EXPIRED') throw err;
      // height check transport error — ignore, loop will continue.
    }

    if (attempts <= maxRetries) await sleep(RETRY_POLL_INTERVAL_MS);
  }

  // Exhausted retries. If we have a signature, status is unknown (TIMEOUT, not a
  // failure — the tx may still land; idempotency guards re-issue). Else RPC error.
  void blockhash;
  if (signature) {
    throw new SolanaTxError('TIMEOUT', 'Confirmation window elapsed; transaction status unknown', { signature });
  }
  throw classify(lastErr ?? new SolanaTxError('RPC_ERROR', 'Failed to broadcast transaction after retries'));
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

  // Apply all signers (ephemerals first, then server/client-relay).
  await applySigners(tx, built.signers);

  return submitSignedTail(tx, blockhash, { ...opts, route }, {
    route,
    priorityFeeMicroLamports,
    jitoTipLamports,
    idempotencyKey,
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
  await ensureBlockhash(tx);

  await prependBudget(tx, built, { route: 'rpc' });

  const idempotencyKey = deriveIdempotencyKey(
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
  const { txBase64, idempotencyKey, extraSigners = [], opts = {} } = input;
  const route = opts.route ?? 'rpc';

  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  if (!tx.feePayer) {
    throw new SolanaTxError('SIGNER_REJECTED', 'Client-signed tx is missing a feePayer');
  }
  if (!tx.recentBlockhash) {
    throw new SolanaTxError('BLOCKHASH_EXPIRED', 'Client-signed tx is missing a recentBlockhash');
  }

  // Apply any remaining server/ephemeral signers (e.g. a platform co-sign).
  // applySigners preserves the client's signature (partial-sign semantics).
  if (extraSigners.length > 0) {
    await applySigners(tx, extraSigners);
  }

  // Reconstruct the blockhash struct for the tail (lastValidBlockHeight may be
  // absent on a deserialized tx; default to the carried value if present).
  const blockhash: BlockhashWithExpiryBlockHeight = {
    blockhash: tx.recentBlockhash,
    lastValidBlockHeight: tx.lastValidBlockHeight ?? 0,
  };

  // Priority fee is already baked into the budget ixs from buildUnsignedForClient;
  // we report the override if given, else 0 (estimate already applied at build).
  const priorityFeeMicroLamports = opts.computeUnitPriceMicroLamports ?? 0;
  const jitoTipLamports = route === 'sender' ? opts.jitoTipLamports ?? getDefaultTipLamports(opts.swqosOnly) : undefined;

  return submitSignedTail(tx, blockhash, { ...opts, route }, {
    route,
    priorityFeeMicroLamports,
    jitoTipLamports,
    idempotencyKey,
  });
}
