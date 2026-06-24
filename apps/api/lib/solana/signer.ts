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

/**
 * Applies every signer to one tx.
 *
 * Ephemerals sign FIRST (local `partialSign`), then the others (privy-server =
 * network call; client-relay = no-op). Legacy-tx signatures are order-independent,
 * but we keep this deterministic order so:
 *   1. the privy-server signer sees the ephemeral signatures already attached
 *      (the §4 multi-signer requirement — Privy must preserve them);
 *   2. logs/idempotency are reproducible.
 */
export async function applySigners(tx: Transaction, signers: Signer[]): Promise<Transaction> {
  const ephemerals = signers.filter((s) => s.kind === 'ephemeral');
  const others = signers.filter((s) => s.kind !== 'ephemeral');
  for (const s of ephemerals) await s.sign(tx); // local partialSign first
  for (const s of others) await s.sign(tx); // privy-server (network) / client-relay (no-op)
  return tx;
}
