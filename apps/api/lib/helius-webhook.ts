/**
 * apps/api/lib/helius-webhook.ts — T-fees (CONTRACTS.md §b.12, D-fees §5)
 * ============================================================================
 * Helius Enhanced Webhook RECEIVER helpers: verify (bearer OR HMAC, constant
 * time) -> parse the enhanced-tx array -> classify IN_APP vs EXTERNAL -> persist
 * `FeeEvent` / `Trade` IDEMPOTENTLY.
 *
 * Idempotency (CONTRACTS §a.6 + D-fees §4/§5.2):
 *   - fast path: Redis SETNX on `webhook:helius:<signature>` short-circuits a
 *     re-delivery before any DB work.
 *   - durable backstop: on-chain rows set `signature` (unique); off-chain rows
 *     set `internalRef` (unique). NEVER both. One tx -> many fee legs keyed by
 *     `(signature, kind, mint)` — encoded into the row `signature` /
 *     `internalRef` so the unique constraint dedupes legs.
 *
 * Classification (D-fees §2.2): a webhook signature that matches a pending
 * Momento-built `Trade` (we hold the intent before the signature exists) is
 * IN_APP; everything else seen on a watched creator mint is EXTERNAL.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import prisma from './prisma';
import { invalidateCache } from './redis';
import { getConnection } from '@/lib/solana';
import { calcFee } from './fees';

// Hard cap on the number of enhanced-tx objects accepted in one delivery. Helius
// batches deliveries; a single body carrying an unbounded array would let one
// (authenticated or replayed) request exhaust the function and hammer the DB
// (DoS). Reject oversized batches before the per-event loop.
const MAX_BATCH_EVENTS = 200;

// ── env ─────────────────────────────────────────────────────────────────────
function getWebhookSecret(): string | undefined {
  return process.env.HELIUS_WEBHOOK_SECRET?.trim() || undefined;
}
function getMaxAgeSeconds(): number {
  const raw = process.env.WEBHOOK_MAX_AGE;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 600; // default 10 min
}
/** Largest accepted batch size; never below 1. */
export function getMaxBatchEvents(): number {
  return MAX_BATCH_EVENTS;
}

// ── Redis (lazy, optional) ───────────────────────────────────────────────────
// Lazy singleton so the module stays import-safe when Upstash env is absent; the
// DB unique constraints are the source of truth, Redis is only a fast path.
let _redis: Redis | null = null;
let _redisTried = false;
function getRedis(): Redis | null {
  if (_redisTried) return _redis;
  _redisTried = true;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;
    _redis = new Redis({ url, token });
  } catch {
    _redis = null;
  }
  return _redis;
}

// ════════════════════════════════════════════════════════════════════════════
//  Verification (mirror lib/veriff.ts — never `===` on the secret)
// ════════════════════════════════════════════════════════════════════════════

/** Length-safe constant-time compare of two utf8 strings. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch; hash both to a fixed width first
  // so the comparison itself never leaks length.
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/**
 * Verify a Helius webhook delivery.
 *  - Bearer mode: `Authorization: Bearer <HELIUS_WEBHOOK_SECRET>` (Helius static
 *    auth header), constant-time compared.
 *  - HMAC mode: `HMAC_SHA256(rawBody, HELIUS_WEBHOOK_SECRET)` hex compared to an
 *    `x-helius-signature` / `x-hmac-signature` header (parity with veriff).
 * Returns false on any mismatch (do NOT leak which check failed).
 * If `HELIUS_WEBHOOK_SECRET` is unset we treat it as misconfigured → false.
 */
export function verifyHeliusWebhook(request: NextRequest, rawBody: string): boolean {
  const secret = getWebhookSecret();
  if (!secret) return false;

  // 1) Bearer / Authorization header mode.
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (safeEqual(presented, secret)) return true;
    // Some Helius configs put the bare secret in `Authorization` — also try the
    // raw header value above; fall through to HMAC if that failed.
  }

  // 2) HMAC mode.
  const sigHeader =
    request.headers.get('x-helius-signature') ||
    request.headers.get('x-hmac-signature') ||
    '';
  if (sigHeader) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('hex')
      .toLowerCase();
    if (safeEqual(sigHeader.toLowerCase(), expected)) return true;
  }

  return false;
}

// ════════════════════════════════════════════════════════════════════════════
//  Parsing
// ════════════════════════════════════════════════════════════════════════════

export interface ParsedHeliusEvent {
  signature: string;
  blockTime: number | null;
  type: string;
  tokenTransfers: Array<{
    mint: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    // Base-unit integer string from Helius `rawTokenAmount.tokenAmount` when
    // present. Carried so the ingest path can avoid `float * 10**decimals`
    // (precision loss past 2^53). Best-effort only — on-chain verification
    // re-derives the authoritative amount from confirmed tx meta.
    rawTokenAmount?: string;
    rawDecimals?: number;
  }>;
  accountData: any[];
  events: any;
}

/**
 * Parse the raw Helius enhanced-tx JSON ARRAY. Lax/defensive — Helius payloads
 * carry many optional fields; we only normalize the ones we use. Non-array or
 * unparseable bodies yield `[]`.
 */
export function parseHeliusBatch(rawBody: string): ParsedHeliusEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed) ? parsed : [];
  const out: ParsedHeliusEvent[] = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, any>;
    const signature: string = e.signature || e.transactionSignature || '';
    if (!signature) continue; // signature is the dedupe key — skip if absent

    const blockTimeRaw = e.timestamp ?? e.blockTime ?? null;
    const blockTime =
      typeof blockTimeRaw === 'number' && Number.isFinite(blockTimeRaw) ? blockTimeRaw : null;

    const tokenTransfersRaw = Array.isArray(e.tokenTransfers) ? e.tokenTransfers : [];
    const tokenTransfers = tokenTransfersRaw
      .filter((t: any) => t && typeof t === 'object')
      .map((t: any) => {
        // Helius enhanced txs may carry `rawTokenAmount: { tokenAmount, decimals }`
        // — a base-unit integer string. Prefer it; never multiply the display
        // float by 10**decimals for on-chain money (CONTRACTS invariant #1).
        const rta = t.rawTokenAmount && typeof t.rawTokenAmount === 'object' ? t.rawTokenAmount : null;
        const rawAmt = rta?.tokenAmount;
        const rawDec = rta?.decimals;
        return {
          mint: String(t.mint ?? ''),
          fromUserAccount: String(t.fromUserAccount ?? ''),
          toUserAccount: String(t.toUserAccount ?? ''),
          tokenAmount: typeof t.tokenAmount === 'number' ? t.tokenAmount : Number(t.tokenAmount ?? 0),
          rawTokenAmount: rawAmt !== undefined && rawAmt !== null ? String(rawAmt) : undefined,
          rawDecimals: typeof rawDec === 'number' ? rawDec : undefined,
        };
      });

    out.push({
      signature,
      blockTime,
      type: String(e.type ?? 'UNKNOWN'),
      tokenTransfers,
      accountData: Array.isArray(e.accountData) ? e.accountData : [],
      events: e.events ?? {},
    });
  }

  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//  Ingestion (classify + persist idempotently)
// ════════════════════════════════════════════════════════════════════════════

function blockTimeToDate(blockTime: number | null): Date | null {
  if (blockTime === null) return null;
  // Helius `timestamp` is unix seconds.
  return new Date(blockTime * 1000);
}

// ── On-chain verification ─────────────────────────────────────────────────────
// SECURITY (REVIEW-security P0): the webhook secret only proves the SENDER, not
// that the asserted tx is real. We therefore treat the payload as low-trust even
// after the secret check and confirm every event against chain before any row is
// written. Amounts are DERIVED from the confirmed tx meta (pre/post token
// balances, base-unit integer strings) — never from the payload float. If the tx
// cannot be confirmed (not landed / RPC unavailable / not a watched mint), we
// SKIP persistence entirely, so unverified data can never drive rebate accrual,
// claimable summaries, or the Phase-4 payout path.

interface VerifiedMint {
  /** Authoritative gross moved (base units) for this mint, from on-chain meta. */
  grossBaseUnits: bigint;
  /** Net signed balance delta over all owners (>0 ⇒ supply credited net). */
  side: 'BUY' | 'SELL';
  /** Best-effort trader wallet (largest debited owner) from meta. */
  trader: string;
  /**
   * Signed per-owner base-unit deltas on THIS mint (owner → delta). Carried so
   * the ingest path — which alone knows the token mint + its paired quote mint —
   * can derive a coherent trader and a reliable BUY/SELL side from the SAME
   * owner's opposite-signed deltas across the two mints (a swap's net cancels to
   * 0 over all owners, so `side` above is unreliable for swaps; see P1 fix).
   */
  ownerDeltas: Map<string, bigint>;
}

interface VerifiedTx {
  /** Authoritative block time (unix seconds) from the confirmed tx. */
  blockTime: number | null;
  /** Per-mint derived amounts, keyed by mint address. */
  byMint: Map<string, VerifiedMint>;
}

/**
 * Confirm a signature on-chain and derive per-mint base-unit amounts from the
 * confirmed transaction's pre/post token balances. Returns `null` when the tx
 * is not found / not confirmed / verification is unavailable — caller MUST skip
 * persistence in that case.
 *
 * Uses base-unit integer strings (`uiTokenAmount.amount`) end-to-end — no float
 * multiply, no 2^53 precision loss, no multi-leg double counting (gross per mint
 * = sum of POSITIVE owner deltas = the credited side, which equals the debited
 * magnitude for a transfer).
 */
async function verifyOnChain(signature: string): Promise<VerifiedTx | null> {
  let tx: any;
  try {
    tx = await getConnection().getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  } catch {
    return null; // RPC unavailable / transient → treat as unverified (skip)
  }
  if (!tx || tx.meta == null || tx.meta.err != null) return null;

  const pre: any[] = Array.isArray(tx.meta.preTokenBalances) ? tx.meta.preTokenBalances : [];
  const post: any[] = Array.isArray(tx.meta.postTokenBalances) ? tx.meta.postTokenBalances : [];

  // Index pre/post balances by (accountIndex). Each carries { mint, owner,
  // uiTokenAmount: { amount: <base-unit string> } }.
  const rawOf = (b: any): bigint => {
    try {
      return BigInt(b?.uiTokenAmount?.amount ?? '0');
    } catch {
      return BigInt(0);
    }
  };
  const preByIdx = new Map<number, any>();
  for (const b of pre) if (typeof b?.accountIndex === 'number') preByIdx.set(b.accountIndex, b);

  // Aggregate signed deltas per (mint, owner).
  const deltas = new Map<string, { mint: string; owner: string; delta: bigint }>();
  const accountIndexes = new Set<number>();
  for (const b of pre) if (typeof b?.accountIndex === 'number') accountIndexes.add(b.accountIndex);
  for (const b of post) if (typeof b?.accountIndex === 'number') accountIndexes.add(b.accountIndex);

  const postByIdx = new Map<number, any>();
  for (const b of post) if (typeof b?.accountIndex === 'number') postByIdx.set(b.accountIndex, b);

  for (const idx of accountIndexes) {
    const p = preByIdx.get(idx);
    const q = postByIdx.get(idx);
    const meta = q ?? p;
    if (!meta?.mint) continue;
    const mint = String(meta.mint);
    const owner = String(meta.owner ?? q?.owner ?? p?.owner ?? '');
    const delta = rawOf(q) - rawOf(p);
    if (delta === BigInt(0)) continue;
    const key = `${mint}:${owner}`;
    const cur = deltas.get(key) ?? { mint, owner, delta: BigInt(0) };
    cur.delta += delta;
    deltas.set(key, cur);
  }

  interface MintAcc {
    grossBaseUnits: bigint;
    net: bigint;
    maxDebit: bigint;
    trader: string;
    ownerDeltas: Map<string, bigint>;
  }
  const acc = new Map<string, MintAcc>();
  for (const { mint, owner, delta } of deltas.values()) {
    const c = acc.get(mint) ?? {
      grossBaseUnits: BigInt(0),
      net: BigInt(0),
      maxDebit: BigInt(0),
      trader: '',
      ownerDeltas: new Map<string, bigint>(),
    };
    // Gross = sum of credited (positive) deltas = transferred magnitude.
    if (delta > BigInt(0)) c.grossBaseUnits += delta;
    c.net += delta;
    // Trader heuristic: the owner with the largest single debit.
    if (delta < BigInt(0)) {
      const debit = -delta;
      if (debit > c.maxDebit && owner) {
        c.maxDebit = debit;
        c.trader = owner;
      }
    }
    // Retain the signed per-owner delta so the ingest path can cross-reference
    // the SAME owner across the token mint and its quote mint.
    if (owner) c.ownerDeltas.set(owner, (c.ownerDeltas.get(owner) ?? BigInt(0)) + delta);
    acc.set(mint, c);
  }

  // Side from the net supply-side delta (best-effort; pool identity is not
  // distinguishable from meta alone). Mark BUY when ambiguous (display-only).
  // NOTE: for a swap the net over all owners cancels to ~0, so this `side` is
  // unreliable for trade classification — the ingest path re-derives a reliable
  // side from the trader's opposite-signed deltas across mint + quote mint.
  const byMint = new Map<string, VerifiedMint>();
  for (const [mint, c] of acc) {
    byMint.set(mint, {
      grossBaseUnits: c.grossBaseUnits,
      side: c.net > BigInt(0) ? 'BUY' : c.net < BigInt(0) ? 'SELL' : 'BUY',
      trader: c.trader,
      ownerDeltas: c.ownerDeltas,
    });
  }

  const blockTime =
    typeof tx.blockTime === 'number' && Number.isFinite(tx.blockTime) ? tx.blockTime : null;

  return { blockTime, byMint };
}

/**
 * Derive a RELIABLE trade side + trader for one creator-token mint from the
 * confirmed on-chain owner deltas (P1 fix). `vm.side` (net over ALL owners) is
 * unusable for a swap because the supply-side credit/debit cancels to ~0 → it
 * defaults to BUY, mislabelling SELLs and mis-counting the raise.
 *
 * The correct signal is a SINGLE owner whose token-mint delta and quote-mint
 * delta have OPPOSITE signs:
 *   - token Δ > 0 AND quote Δ < 0  ⇒ BUY  (trader spent quote, gained token)
 *   - token Δ < 0 AND quote Δ > 0  ⇒ SELL (trader sold token, received quote)
 * `quoteDelta` is the trader's SIGNED quote-mint delta; a confirmed curve BUY
 * MUST have quoteDelta < 0 (quote actually flowed OUT of the trader) before any
 * raise increment. When no paired quote leg is visible (quoteVm absent) we fall
 * back to the token-mint trader heuristic and the net-derived side — usable for
 * the fee leg, but the caller must NOT count such an event toward the raise.
 */
function deriveTradeSide(
  vm: VerifiedMint,
  quoteVm: VerifiedMint | undefined,
): { side: 'BUY' | 'SELL'; trader: string; quoteDelta: bigint } {
  if (quoteVm) {
    // Find an owner present on BOTH mints with opposite-signed deltas. Prefer the
    // owner with the largest absolute token-mint delta (the actual counterparty,
    // not the pool — the pool nets the other way on both legs).
    let best: { trader: string; side: 'BUY' | 'SELL'; quoteDelta: bigint; mag: bigint } | null =
      null;
    for (const [owner, tokenDelta] of vm.ownerDeltas) {
      if (!owner || tokenDelta === BigInt(0)) continue;
      const quoteDelta = quoteVm.ownerDeltas.get(owner) ?? BigInt(0);
      if (quoteDelta === BigInt(0)) continue;
      // opposite signs only
      const buy = tokenDelta > BigInt(0) && quoteDelta < BigInt(0);
      const sell = tokenDelta < BigInt(0) && quoteDelta > BigInt(0);
      if (!buy && !sell) continue;
      const mag = tokenDelta > BigInt(0) ? tokenDelta : -tokenDelta;
      if (!best || mag > best.mag) {
        best = { trader: owner, side: buy ? 'BUY' : 'SELL', quoteDelta, mag };
      }
    }
    if (best) return { side: best.side, trader: best.trader, quoteDelta: best.quoteDelta };
  }
  // Fallback: no resolvable paired counterparty. Use the token-mint heuristics;
  // quoteDelta unknown (0) ⇒ caller will not count toward the raise.
  return { side: vm.side, trader: vm.trader || '', quoteDelta: BigInt(0) };
}

/**
 * Ingest a parsed batch. For each event:
 *   1. Bound the batch size (DoS guard) — caller passes a capped array.
 *   2. Freshness/replay window: drop events older than WEBHOOK_MAX_AGE by event
 *      timestamp (a captured valid body cannot be replayed indefinitely).
 *   3. Redis SETNX fast-path dedupe on the signature.
 *   4. ON-CHAIN VERIFICATION (P0): confirm the signature and DERIVE amounts from
 *      the confirmed tx meta. Unverifiable events are SKIPPED (never persisted).
 *   5. Find watched creator tokens for the mints actually moved on-chain.
 *   6. Classify: existing `Trade` with this signature → IN_APP (confirm it);
 *      else if the mint is a watched creator mint → EXTERNAL (insert Trade).
 *   7. Persist the per-event legs in a SINGLE prisma.$transaction (no swallowed
 *      errors): a `TRANSFER_FEE_WITHHELD` `FeeEvent` per (signature, mint) leg
 *      with `source` matching the trade. On-chain row → set `signature` (encodes
 *      the leg key), leave `internalRef` null. Inserts use `skipDuplicates` so a
 *      re-delivery is an insert-or-ignore no-op (durable backstop, CONTRACTS §a.6).
 *   8. Invalidate the affected fee-summary caches after a successful batch.
 *
 * At-least-once safe. Unexpected DB errors are NOT swallowed — they surface to
 * the route so Helius retries and monitoring fires. Returns counts (§e.1).
 */
export async function ingestHeliusEvents(
  events: ParsedHeliusEvent[],
): Promise<{ received: number; processed: number; skipped: number }> {
  let received = 0;
  let processed = 0;
  let skipped = 0;

  const redis = getRedis();
  const maxAge = getMaxAgeSeconds();
  const nowSec = Math.floor(Date.now() / 1000);
  const touchedMints = new Set<string>();

  for (const ev of events) {
    received++;

    // (2) Replay/freshness window: reject stale events by their own timestamp.
    // Admin back-fill should bypass via a separate path, not this receiver.
    if (ev.blockTime !== null && nowSec - ev.blockTime > maxAge) {
      skipped++;
      continue;
    }

    // (3) Redis fast-path dedupe. NX = only set if absent → true on first sight.
    if (redis) {
      try {
        const key = `webhook:helius:${ev.signature}`;
        const set = await redis.set(key, '1', { nx: true, ex: maxAge });
        if (set === null) {
          // already processed recently → skip without DB work
          skipped++;
          continue;
        }
      } catch {
        // Redis unavailable → fall through; the DB unique key is the real guard.
      }
    }

    // (4) ON-CHAIN VERIFICATION (P0). Confirm the signature + derive amounts from
    // the confirmed tx meta. Unverifiable ⇒ skip persistence (no rebate/claim
    // poisoning). On a transient RPC failure, drop the Redis fast-path marker so
    // a later re-delivery can retry verification (DB unique key still dedupes).
    const verified = await verifyOnChain(ev.signature);
    if (!verified) {
      if (redis) {
        try {
          await redis.del(`webhook:helius:${ev.signature}`);
        } catch {
          /* best effort */
        }
      }
      skipped++;
      continue;
    }

    // (5) Only mints the confirmed tx actually moved are eligible.
    const mints = Array.from(verified.byMint.keys()).filter((m) => !!m);
    if (mints.length === 0) {
      skipped++;
      continue;
    }

    const tokens = await prisma.creatorToken.findMany({
      where: { mintAddress: { in: mints } },
      include: { feeConfig: true },
    });
    if (tokens.length === 0) {
      // Not a watched creator mint — nothing to record.
      skipped++;
      continue;
    }

    const tokenByMint = new Map(tokens.map((t) => [t.mintAddress as string, t]));
    // Authoritative block time from the confirmed tx (fall back to payload).
    const blockTime = blockTimeToDate(verified.blockTime ?? ev.blockTime);

    // (6) Classify on the signature: hit ⇒ IN_APP (confirm), miss ⇒ EXTERNAL.
    const existingTrade = await prisma.trade.findUnique({
      where: { signature: ev.signature },
      select: { id: true, source: true, tokenId: true },
    });

    // Commit all legs for this event atomically (7): trade create/update +
    // fee leg inserts run inside ONE interactive transaction so a partial
    // failure rolls back the whole event rather than leaving an orphaned Trade
    // or FeeEvent.
    let anyWork = false;
    const watchedMints = mints.filter((m) => tokenByMint.has(m));

    try {
      await prisma.$transaction(async (db) => {
        for (const mint of watchedMints) {
          const token = tokenByMint.get(mint);
          if (!token) continue;

          const vm = verified.byMint.get(mint)!;
          const feeBps = token.feeConfig?.transferFeeBps ?? token.transferFeeBps ?? 0;
          const maxFee = token.transferFeeMaxBaseUnits
            ? BigInt(token.transferFeeMaxBaseUnits)
            : BigInt(0);

          // Gross is the authoritative on-chain base-unit integer (no float).
          const grossBaseUnits = vm.grossBaseUnits;
          const withheld = calcFee(grossBaseUnits, feeBps, maxFee);

          // (P1) Derive a RELIABLE trader + BUY/SELL side from the confirmed
          // owner deltas across the token mint and its paired quote mint — NOT
          // from `vm.side` (which cancels to BUY for any swap). `payer` is lifted
          // to the per-mint block scope so EVERY branch below (and the raise
          // counter) references the SAME in-scope value (P0: the old
          // block-scoped `payer` threw a ReferenceError in the counter block on
          // any matched/cross-token leg).
          const quoteVm = token.quoteMint ? verified.byMint.get(token.quoteMint) : undefined;
          const derived = deriveTradeSide(vm, quoteVm);
          const payer = derived.trader;
          // A confirmed curve BUY against the quote mint requires the trader's
          // quote delta to be NEGATIVE (quote actually left the trader). Only
          // such legs may advance the raise counter.
          const isCurveBuy = derived.side === 'BUY' && derived.quoteDelta < BigInt(0);

          // DBC-phase tokens persist curve trades under venue METEORA_DBC so the
          // graduation recompute filter (graduation.ts: venue=METEORA_DBC, side=
          // BUY, amountInMint=quoteMint) can see external curve buys. Non-DBC
          // tokens keep their pool type (DAMM v2 post-graduation).
          const isDbcPhase =
            token.poolType === 'METEORA_DBC' ||
            (!!token.dbcPoolAddress && token.status !== 'GRADUATED');
          const venue: 'METEORA_DBC' | 'METEORA_DAMM_V2' | 'BONDING_CURVE' | 'RAYDIUM' = isDbcPhase
            ? 'METEORA_DBC'
            : token.poolType ?? 'METEORA_DAMM_V2';

          let tradeId: string | null = null;
          let source: 'IN_APP' | 'EXTERNAL';

          if (existingTrade && existingTrade.tokenId === token.id) {
            source = existingTrade.source === 'IN_APP' ? 'IN_APP' : 'EXTERNAL';
            tradeId = existingTrade.id;
            await db.trade.update({
              where: { id: existingTrade.id },
              data: { blockTime: blockTime ?? undefined },
            });
          } else if (!existingTrade) {
            source = 'EXTERNAL';
            // Persist the row so the graduation recompute (computeConfirmedRaise)
            // can count external curve buys: for a confirmed curve BUY against
            // the quote mint, record the QUOTE leg (amountInMint=quoteMint,
            // amountInBaseUnits=<confirmed quote base units>); otherwise record
            // the token-mint leg. The quote base units are the magnitude of the
            // trader's signed quote delta.
            const quoteBaseUnits =
              derived.quoteDelta < BigInt(0) ? -derived.quoteDelta : derived.quoteDelta;
            const writeQuoteLeg = isCurveBuy && !!token.quoteMint && quoteBaseUnits > BigInt(0);
            const created = await db.trade.upsert({
              where: { signature: ev.signature },
              update: { blockTime: blockTime ?? undefined },
              create: {
                tokenId: token.id,
                traderWallet: payer,
                side: derived.side,
                source: 'EXTERNAL',
                venue,
                signature: ev.signature,
                amountInBaseUnits: writeQuoteLeg
                  ? quoteBaseUnits.toString()
                  : grossBaseUnits.toString(),
                amountInMint: writeQuoteLeg ? token.quoteMint! : mint,
                amountOutBaseUnits: writeQuoteLeg ? grossBaseUnits.toString() : '0',
                amountOutMint: writeQuoteLeg ? mint : token.quoteMint ?? '',
                transferFeeBaseUnits: withheld.toString(),
                feeBps: feeBps || null,
                poolAddress: token.dbcPoolAddress ?? token.poolAddress ?? null,
                blockTime: blockTime ?? undefined,
              },
              select: { id: true },
            });
            tradeId = created.id;
          } else {
            // Signature matched a Trade on a DIFFERENT token — record the leg
            // for this mint without touching the other token's trade row.
            source = 'EXTERNAL';
          }

          // (7) TRANSFER_FEE_WITHHELD fee leg. ON-CHAIN row: set `signature`
          // (encode the leg key so each (sig,kind,mint) is unique), leave
          // `internalRef` null (CONTRACTS §a.6). Pre-attribution → recipient
          // PROTOCOL (deliberately excluded from claimable summaries; the
          // attributed CREATOR/PARTNER legs are written by the Phase-3 claim).
          const legSignature = `${ev.signature}:TRANSFER_FEE_WITHHELD:${mint}`;
          const legInsert = await db.feeEvent.createMany({
            data: [
              {
                tokenId: token.id,
                tradeId: tradeId ?? undefined,
                type: 'TRANSFER_FEE_WITHHELD',
                source,
                recipient: 'PROTOCOL',
                grossBaseUnits: grossBaseUnits.toString(),
                feeBaseUnits: withheld.toString(),
                netBaseUnits: (grossBaseUnits - withheld).toString(),
                amountMint: mint,
                feeBps: feeBps || null,
                signature: legSignature,
                blockTime: blockTime ?? undefined,
              },
            ],
            skipDuplicates: true, // durable idempotency backstop
          });

          // (7b) GRADUATION raised tracking (D-graduation §3.2). On the FIRST
          // confirmation of a curve BUY (quote-in) for a watched fundraise mint,
          // bump the cached `raisedBaseUnits` / `contributorCount` counters by the
          // CONFIRMED quote base units this tx moved. ADDITIVE + idempotent:
          //   - Gated on `legInsert.count === 1` (the per-(sig,mint) unique key
          //     above): a deduped re-delivery skips the insert ⇒ no double increment.
          //   - Gated on `isCurveBuy` (P1): the trader's quote delta is strictly
          //     NEGATIVE (quote actually left the trader). A SELL — which `vm.side`
          //     mislabels as BUY (net cancels) — has quoteDelta >= 0 and is NOT
          //     counted, so the raise is never bumped in the wrong direction.
          //   - ATOMIC at the DB level (P1): a single conditional `$executeRaw`
          //     adds the delta to the `text` column via a `::numeric` cast inside
          //     the UPDATE (Prisma `increment` is unusable on a String column and
          //     a read-then-write loses concurrent increments under READ
          //     COMMITTED). The status filter makes it a no-op when there is no
          //     fundraise row or it is already terminal — never throws.
          //   - Authoritative quote amount = the magnitude of the trader's signed
          //     quote delta (on-chain meta), never a payload float.
          //   - This is a CACHED display value; the authoritative raise + distinct
          //     contributor count are recomputed in graduation.getRaisedProgress.
          if (legInsert.count === 1 && isCurveBuy && token.quoteMint) {
            const raisedQuote = -derived.quoteDelta; // quoteDelta < 0 ⇒ positive
            if (raisedQuote > BigInt(0)) {
              const deltaStr = raisedQuote.toString();
              // Atomic conditional increment of the cached raise (single UPDATE,
              // no lost-update window). Returns affected-row count; 0 ⇒ no active
              // fundraise (benign no-op).
              await db.$executeRaw`
                UPDATE "token_fundraises"
                SET "raisedBaseUnits" =
                  (("raisedBaseUnits"::numeric) + ${deltaStr}::numeric)::text
                WHERE "tokenId" = ${token.id}
                  AND "status" IN ('DRAFT', 'ACTIVE', 'THRESHOLD_MET')
              `;
              // contributorCount: increment ONLY when no PRIOR counted BUY exists
              // for this (token, wallet) — evaluated inside the SAME single UPDATE
              // via a correlated NOT EXISTS, so there is no separate read-then-
              // write gap. The current row was already inserted above, so it is
              // excluded by `signature <> current`. Residual: two concurrent
              // first-buys from the same wallet in separate txns cannot see each
              // other's uncommitted row → possible +1 over-count; the keeper's
              // distinct-wallet recompute is authoritative.
              if (payer) {
                await db.$executeRaw`
                  UPDATE "token_fundraises" f
                  SET "contributorCount" = f."contributorCount" + 1
                  WHERE f."tokenId" = ${token.id}
                    AND f."status" IN ('DRAFT', 'ACTIVE', 'THRESHOLD_MET')
                    AND NOT EXISTS (
                      SELECT 1 FROM "trades" t
                      WHERE t."tokenId" = ${token.id}
                        AND t."traderWallet" = ${payer}
                        AND t."side" = 'BUY'::"TradeSide"
                        AND t."signature" <> ${ev.signature}
                    )
                `;
              }
            }
          }

          touchedMints.add(mint);
          anyWork = true;
        }
      });
    } catch (err) {
      // Do NOT swallow: drop the Redis fast-path marker so the retry is not
      // deduped away, and rethrow so the route returns 5xx and Helius retries.
      if (redis) {
        try {
          await redis.del(`webhook:helius:${ev.signature}`);
        } catch {
          /* best effort */
        }
      }
      throw err;
    }

    if (anyWork) processed++;
    else skipped++;
  }

  // (8) Invalidate affected fee-summary caches after a successful batch
  // (REVIEW-security P1 / SPEC §5.6). The summary read models in `lib/fees.ts`
  // currently query Prisma directly (no getOrSetCache), so today this is a
  // forward-safe no-op; wiring it now means a future cached summary cannot serve
  // stale post-ingest data. Mirrors the kyc-webhook invalidation pattern.
  if (touchedMints.size > 0) {
    try {
      const keys = ['feeSummary:*', ...Array.from(touchedMints).map((m) => `feeSummary:${m}:*`)];
      await invalidateCache(...keys);
    } catch {
      // Cache invalidation is best-effort; never fail ingest on a cache miss.
    }
  }

  return { received, processed, skipped };
}
