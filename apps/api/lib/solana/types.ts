/**
 * Cross-cutting TS interfaces for the signer / submit layer (§b.1 / D-signer §2).
 *
 * These are the contracts that the Phase 3 mint / pool / fee-claim / vesting
 * modules build against. Keep them STABLE — changing them ripples into every
 * consumer. All money/amount values that cross a boundary are base-unit strings;
 * lamport/micro-lamport hints are plain numbers (SOL-scale, safe in a JS number).
 */

import type {
  Transaction,
  PublicKey,
  Commitment,
} from '@solana/web3.js';

/** A signer that can add its signature(s) to a v1 legacy `Transaction`. */
export interface Signer {
  /** The public key this signer signs as (the primary authority). */
  readonly publicKey: PublicKey;
  /** How this signer participates: server-held key, client-relayed, or ephemeral. */
  readonly kind: 'privy-server' | 'client-relay' | 'ephemeral';
  /**
   * Sign `tx` in place (or return a signed copy). For client-relay this is a
   * no-op marker — the client supplies the signature out-of-band.
   * MUST NOT clear other parties' signatures (partial-sign semantics).
   */
  sign(tx: Transaction): Promise<Transaction>;
}

/** Output of a builder: an unsigned tx + every signer that must sign it. */
export interface BuiltTx {
  /** feePayer + blockhash are filled by submit(), NOT by the builder. */
  tx: Transaction;
  /** primary signer(s) + any ephemeral co-signers (order-independent for legacy tx). */
  signers: Signer[];
  /** Compute-unit ceiling hint; submit() refines via simulation if omitted. */
  computeUnitLimit?: number;
  /** Optional human label for logs/idempotency (e.g. 'mint', 'dbc.createPool', 'claimFees'). */
  label?: string;
}

/** 'sender' = Helius Sender (Jito dual-route). */
export type SubmitRoute = 'rpc' | 'sender';

export interface SubmitOptions {
  /** default 'rpc'; launch/fee-claim use 'sender'. */
  route?: SubmitRoute;
  /** Helius priority levels for getPriorityFeeEstimate. */
  priorityLevel?: 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax';
  /** Sender only; default from env, min 0.0002 SOL (5_000 lamports if swqosOnly). */
  jitoTipLamports?: number;
  /** Sender '?swqos_only=true' (cheaper tip, validators only). */
  swqosOnly?: boolean;
  /** default 'confirmed'. */
  commitment?: Commitment;
  /** app-level resubmits within blockhash validity; default 5 (rpc) / 0-handled (sender). */
  maxRetries?: number;
  /** caller-supplied; else derived (idempotency.ts deriveIdempotencyKey). */
  idempotencyKey?: string;
  /** override the Helius estimate. */
  computeUnitPriceMicroLamports?: number;
}

export interface SubmitResult {
  signature: string;
  slot?: number;
  route: SubmitRoute;
  priorityFeeMicroLamports: number;
  jitoTipLamports?: number;
  attempts: number;
  idempotencyKey: string;
  /** true if returned from idempotency cache, not freshly landed. */
  deduped: boolean;
}
