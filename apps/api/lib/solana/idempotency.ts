/**
 * Idempotency seam (§b.8 / D-signer §6) — avoid double-submitting a tx.
 *
 * Key = caller-supplied `idempotencyKey`, else derived from the UNSIGNED message
 * (stable across retries; independent of the not-yet-present signatures).
 *
 * DEFAULT store (when Upstash is configured): a Redis-backed, cross-instance,
 * ATOMIC store built on the same Upstash REST creds as `lib/redis.ts`
 * (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). `reserve()` is an
 * atomic `SET key <value> NX EX <ttl>`; `get`/`put` persist the landed signature.
 * This survives serverless cold starts / multi-instance fan-out, so a treasury /
 * fee-claim tx is broadcast at most once even across Vercel instances.
 *
 * FAIL-CLOSED: when Upstash is NOT configured, the durable store is unavailable.
 * `submit.ts` MUST refuse to broadcast a server/treasury-signed tx with only the
 * in-process Map (see REVIEW-security P0: serverless double-broadcast risk). The
 * in-process `InMemoryIdempotencyStore` therefore remains ONLY as an explicit
 * dev/test opt-in via `setIdempotencyStore()`, never as the live default.
 *
 * IMPORT-SAFE: no env read at module top-level; the Upstash client is constructed
 * lazily on first store use (mirrors `lib/redis.ts` getRedis()).
 */

import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';

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

/** Default TTL (10 min — covers a blockhash lifetime + slack). */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TTL_S = Math.ceil(DEFAULT_TTL_MS / 1000);

/** Marker stored in Redis for a reserved-but-not-yet-landed key. */
const RESERVED_MARKER = '__reserved__';
/** Redis key namespace for idempotency entries. */
const REDIS_PREFIX = 'solana:idem:';

/**
 * In-process Map store. Single-instance only — DEV/TEST opt-in via
 * setIdempotencyStore(), never the live default (see file header / security P0).
 * Note: JS is single-threaded per instance, so `reserve` is atomic here without
 * locks — the get/set pair cannot be interleaved by another call.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
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

/**
 * Redis-backed, cross-instance idempotency store (Upstash REST).
 *
 * Layout: one key per idempotency key, value = landed signature, or the
 * RESERVED_MARKER while in-flight. `reserve` uses `SET ... NX EX` (atomic;
 * succeeds only if the key is absent). `put` overwrites the reservation with the
 * landed signature (still TTL'd, so dedup holds for the blockhash window + slack).
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly ttlS: number;
  private _redis: Redis | null = null;

  constructor(ttlS: number = DEFAULT_TTL_S) {
    this.ttlS = ttlS;
  }

  /** Lazy Upstash client — mirrors lib/redis.ts getRedis() (no top-level env read). */
  private redis(): Redis {
    if (!this._redis) {
      const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
      const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
      if (!url || !token) {
        // Should never reach here: isRedisConfigured() gates construction/use.
        throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
      }
      this._redis = new Redis({ url, token });
    }
    return this._redis;
  }

  private k(key: string): string {
    return REDIS_PREFIX + key;
  }

  async get(key: string): Promise<string | null> {
    const v = await this.redis().get<string>(this.k(key));
    if (v == null || v === RESERVED_MARKER) return null;
    return v;
  }

  async put(key: string, signature: string): Promise<void> {
    // Overwrite the reservation with the landed signature; keep a TTL so the
    // dedup record lives past the blockhash window but doesn't accumulate.
    await this.redis().set(this.k(key), signature, { ex: this.ttlS });
  }

  async reserve(key: string): Promise<boolean> {
    // Atomic SETNX with TTL: only the first caller across ALL instances wins.
    const res = await this.redis().set(this.k(key), RESERVED_MARKER, {
      nx: true,
      ex: this.ttlS,
    });
    return res === 'OK';
  }
}

/** True if Upstash REST creds are present (the durable store can be used). */
export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

let _store: IdempotencyStore | null = null;

/**
 * Singleton idempotency store.
 *
 * DEFAULT: Redis-backed (durable, atomic, cross-instance) when Upstash is
 * configured. Otherwise returns `null` — there is NO live in-process fallback,
 * because a per-process Map cannot guarantee at-most-once broadcast under
 * serverless fan-out (security P0). Callers that require durability for a
 * server/treasury-signed broadcast MUST treat `null` as fail-closed
 * (`submit.ts` throws CONFIG_MISSING). An explicit dev/test Map can be installed
 * via `setIdempotencyStore(new InMemoryIdempotencyStore())`.
 */
export function getIdempotencyStore(): IdempotencyStore | null {
  if (_store) return _store;
  if (isRedisConfigured()) {
    _store = new RedisIdempotencyStore();
    return _store;
  }
  return null;
}

/**
 * Inject a store. Ops may supply a durable (Redis/Prisma) store; tests/dev may
 * opt into the in-process Map. Pass `null` to reset back to the default
 * (Redis-when-configured) resolution.
 */
export function setIdempotencyStore(store: IdempotencyStore | null): void {
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
