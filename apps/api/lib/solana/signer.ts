/**
 * Signer implementations + the MultiSigner combiner (§b.3 / D-signer §4).
 *
 * Three Signer kinds, one combiner:
 *   - serverSigner()      kind 'privy-server'  — delegates to ServerWallet.signTransaction
 *   - ephemeralSigner(kp) kind 'ephemeral'     — holds a local Keypair; sign() => tx.partialSign(kp)
 *   - clientRelaySigner() kind 'client-relay'  — sign() is a NO-OP (the client adds the sig)
 *
 * The combiner `applySigners` is what lets a single tx carry the Privy/server
 * signer PLUS an ephemeral `Keypair` (Streamflow `metadata` / JupLock `base`) —
 * the exact pattern proven in spike-c (`sendAndConfirmTransaction(conn, tx, [payer, metadata])`).
 */

import { Keypair } from '@solana/web3.js';
import type { PublicKey, Transaction } from '@solana/web3.js';
import type { Signer } from './types';
import { getServerWallet } from './serverWallet';
import { SolanaTxError } from './errors';

/**
 * The Momento treasury (Privy server wallet) wrapped as a Signer.
 * `address` is resolved lazily by ServerWallet on first read.
 */
export function serverSigner(): Signer {
  const wallet = getServerWallet();
  return {
    get publicKey(): PublicKey {
      return wallet.address;
    },
    kind: 'privy-server',
    async sign(tx: Transaction): Promise<Transaction> {
      // ServerWallet.signTransaction must PRESERVE any ephemeral partialSign
      // already on `tx` (see TODO(verify-devnet) in serverWallet.ts / D-signer §4).
      return wallet.signTransaction(tx);
    },
  };
}

/**
 * Wraps a generated/passed `Keypair` as an ephemeral co-signer (Streamflow
 * metadata / JupLock base). If no Keypair is passed, one is generated — the
 * caller MUST keep the returned signer (its publicKey is the new account / PDA
 * seed) to derive escrow addresses etc.
 *
 * sign() uses `tx.partialSign(kp)` so it only adds THIS key's signature slot and
 * never clears the others (legacy-tx partial-sign semantics).
 */
export function ephemeralSigner(kp?: Keypair): Signer {
  const keypair = kp ?? Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    kind: 'ephemeral',
    async sign(tx: Transaction): Promise<Transaction> {
      tx.partialSign(keypair);
      return tx;
    },
  };
}

/**
 * Placeholder for a tx that the CLIENT will sign (embedded-wallet user action).
 * sign() is a NO-OP: the client supplies its signature out-of-band (the relay
 * flow buildUnsignedForClient -> client signs -> submitClientSigned). publicKey
 * is the user's wallet (the eventual fee payer for client actions).
 */
export function clientRelaySigner(userPubkey: PublicKey): Signer {
  return {
    publicKey: userPubkey,
    kind: 'client-relay',
    async sign(tx: Transaction): Promise<Transaction> {
      // No-op: the client adds its signature; nothing to do server-side.
      return tx;
    },
  };
}

/** Pull the current signature buffer for `pubkey` from a tx, or null if unsigned. */
function signatureFor(tx: Transaction, pubkey: PublicKey): Buffer | null {
  const slot = tx.signatures.find((s) => s.publicKey.equals(pubkey));
  return slot?.signature ?? null;
}

/**
 * Applies every signer to one tx, defending the ephemeral co-signatures against
 * a server signer (Privy) that may strip pre-attached partial signatures.
 *
 * Flow:
 *   1. Ephemerals sign FIRST (local `partialSign` — Streamflow `metadata` /
 *      JupLock `base`). Snapshot their signatures.
 *   2. Other signers run (privy-server = network call; client-relay = no-op).
 *   3. RE-ATTACH any ephemeral signature that the server sign dropped, via
 *      `tx.addSignature(pubkey, sig)` (idempotent for surviving sigs).
 *   4. Verify every REQUIRED non-client-relay signer slot is present; if an
 *      ephemeral sig is still missing post-sign, throw PARTIAL_SIGN_UNSUPPORTED.
 *
 * Legacy-tx signatures are order-independent, but the deterministic order keeps
 * logs/idempotency reproducible and lets Privy observe the ephemeral sigs.
 *
 * TODO(verify-devnet): confirm on devnet whether @privy-io/node signTransaction
 * preserves pre-attached ephemeral partial signatures (D-signer §4). If it
 * strips them and re-attach below fails verification, route co-signed
 * (Streamflow/JupLock) txns through the CLIENT embedded wallet relay instead and
 * keep server-wallet txns single-signer (documented fallback in serverWallet.ts).
 */
export async function applySigners(tx: Transaction, signers: Signer[]): Promise<Transaction> {
  const ephemerals = signers.filter((s) => s.kind === 'ephemeral');
  const others = signers.filter((s) => s.kind !== 'ephemeral');
  const hasServerSigner = others.some((s) => s.kind === 'privy-server');

  // 1. Ephemerals sign first (local partialSign).
  for (const s of ephemerals) await s.sign(tx);

  // 2. Snapshot ephemeral signatures BEFORE the server sign, so we can detect +
  //    repair stripping. Only matters when a server signer participates.
  const captured = new Map<string, Buffer>();
  if (hasServerSigner) {
    for (const s of ephemerals) {
      const sig = signatureFor(tx, s.publicKey);
      if (sig) captured.set(s.publicKey.toBase58(), Buffer.from(sig));
    }
  }

  // 3. Other signers (privy-server network call / client-relay no-op).
  for (const s of others) await s.sign(tx);

  // 4. Re-attach any ephemeral signature dropped by the server sign.
  // TODO(verify-devnet): re-attaching the CAPTURED bytes is only valid if Privy
  // signs the SAME compiled message (does not mutate blockhash/ixs). If Privy
  // re-serializes the message, the captured ephemeral sig is over stale bytes and
  // will fail on-chain verifySignatures even though the slot is present. Confirm
  // on devnet; if message mutation is observed, fall back to client-wallet relay
  // for co-signed txns (documented in serverWallet.ts TODO(verify-devnet)).
  if (hasServerSigner) {
    for (const s of ephemerals) {
      const present = signatureFor(tx, s.publicKey);
      const original = captured.get(s.publicKey.toBase58());
      if (!present && original) {
        // Privy stripped it — restore the captured signature in-place.
        tx.addSignature(s.publicKey, original);
      }
    }
  }

  // 5. Verify every required signer (everything except client-relay, whose sig
  //    the client supplies out-of-band) now has a signature. A still-missing
  //    ephemeral sig means the server signer is incompatible with multi-signing.
  for (const s of others) {
    if (s.kind === 'client-relay') continue;
    if (!signatureFor(tx, s.publicKey)) {
      throw new SolanaTxError(
        'SIGNER_REJECTED',
        `Required ${s.kind} signature missing after signing for ${s.publicKey.toBase58()}`,
      );
    }
  }
  for (const s of ephemerals) {
    if (!signatureFor(tx, s.publicKey)) {
      throw new SolanaTxError(
        'PARTIAL_SIGN_UNSUPPORTED',
        `Ephemeral co-signer ${s.publicKey.toBase58()} signature was stripped and could not be ` +
          're-attached after the server sign — server signer does not support multi-signing. ' +
          'Route this co-signed tx through the client embedded wallet instead.',
      );
    }
  }

  return tx;
}
