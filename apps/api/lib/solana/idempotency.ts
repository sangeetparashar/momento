/**
 * Idempotency seam (§b.8 / D-signer §6) — avoid double-submitting a tx.
 *
 * Key = caller-supplied `idempotencyKey`, else derived from the UNSIGNED message
 * (stable across retries; independent of the not-yet-present signatures).
 *
 * Default store is an in-process `Map` with TTL — import-safe, zero deps, but
 * does NOT survive serverless cold starts / multi-instance.
 *
 * TODO(ops): back the store with the existing Postgres/Prisma or the rate-limit
 * Redis (`lib/ratelimit` / `lib/redis`) so reservations + landed signatures
 * survive across instances. This is REQUIRED before any treasury/fee-claim
 * action goes live (those must never double-fire). Swap getIdempotencyStore()'s
 * default implementation; the interface stays identical.
 */

import { createHash } from 'crypto';

export interface IdempotencyStore {
  /** returns the prior signature if this key already landed, else null. */
  get(key: string): Promise<string | null>;
  /** record the landed signature for this key. */
  put(key: string, signature: string): Promise<void>;
  /** atomic; true if this call newly reserved the key (caller may broadcast). */
  reserve(key: string): Promise<boolean>;
}

interface Entry {
  /** landed signature, or null while reserved-but-in-flight. */
  signature: string | null;
  /** epoch ms when this entry becomes collectable. */
  expiresAt: number;
}

/** Default TTL for in-process entries (10 min — covers a blockhash lifetime + slack). */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * In-process Map store. Single-instance only.
 * Note: JS is single-threaded per instance, so `reserve` is atomic here without
 * locks — the get/set pair cannot be interleaved by another call.
 */
class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, Entry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  private sweep(now: number): void {
    for (const [k, v] of this.map) {
      if (v.expiresAt <= now) this.map.delete(k);
    }
  }

  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return null;
    }
    return entry.signature;
  }

  async put(key: string, signature: string): Promise<void> {
    this.map.set(key, { signature, expiresAt: Date.now() + this.ttlMs });
  }

  async reserve(key: string): Promise<boolean> {
    const now = Date.now();
    this.sweep(now);
    const existing = this.map.get(key);
    if (existing && existing.expiresAt > now) {
      return false; // already reserved (in-flight) or landed
    }
    this.map.set(key, { signature: null, expiresAt: now + this.ttlMs });
    return true;
  }
}

let _store: IdempotencyStore | null = null;

/** Singleton idempotency store. In-process Map default; TODO(ops): Prisma/Redis. */
export function getIdempotencyStore(): IdempotencyStore {
  if (!_store) {
    _store = new InMemoryIdempotencyStore();
  }
  return _store;
}

/** Allow ops/tests to inject a durable store (Prisma/Redis-backed). */
export function setIdempotencyStore(store: IdempotencyStore): void {
  _store = store;
}

/**
 * Derive a stable idempotency key from the UNSIGNED message.
 * sha256(label + feePayer + serialized-unsigned-message-base64). Stable across
 * retries because it excludes the (not-yet-present, mutable) signatures.
 */
export function deriveIdempotencyKey(
  label: string,
  feePayer: string,
  unsignedMessageB64: string,
): string {
  return createHash('sha256')
    .update(label, 'utf8')
    .update('\0', 'utf8')
    .update(feePayer, 'utf8')
    .update('\0', 'utf8')
    .update(unsignedMessageB64, 'utf8')
    .digest('hex');
}
