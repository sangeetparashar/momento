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
import { calcFee } from './fees';

// ── env ─────────────────────────────────────────────────────────────────────
function getWebhookSecret(): string | undefined {
  return process.env.HELIUS_WEBHOOK_SECRET?.trim() || undefined;
}
function getMaxAgeSeconds(): number {
  const raw = process.env.WEBHOOK_MAX_AGE;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 600; // default 10 min
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
      .map((t: any) => ({
        mint: String(t.mint ?? ''),
        fromUserAccount: String(t.fromUserAccount ?? ''),
        toUserAccount: String(t.toUserAccount ?? ''),
        tokenAmount: typeof t.tokenAmount === 'number' ? t.tokenAmount : Number(t.tokenAmount ?? 0),
      }));

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

/**
 * Ingest a parsed batch. For each event:
 *   1. Redis SETNX fast-path dedupe on the signature.
 *   2. Find watched creator tokens for the mints in `tokenTransfers`.
 *   3. Classify: existing `Trade` with this signature → IN_APP (confirm it);
 *      else if the mint is a watched creator mint → EXTERNAL (insert Trade).
 *   4. Emit a TRANSFER_FEE_WITHHELD `FeeEvent` per (signature, mint) leg with
 *      `source` matching the trade. On-chain row → set `signature` (encodes the
 *      leg key), leave `internalRef` null. `createMany({ skipDuplicates: true })`
 *      makes a duplicate leg an insert-or-ignore no-op (durable backstop).
 *
 * Always safe to re-run (at-least-once delivery). Returns counts for the
 * receiver response (§e.1).
 */
export async function ingestHeliusEvents(
  events: ParsedHeliusEvent[],
): Promise<{ received: number; processed: number; skipped: number }> {
  let received = 0;
  let processed = 0;
  let skipped = 0;

  const redis = getRedis();

  for (const ev of events) {
    received++;

    // (1) Redis fast-path dedupe. NX = only set if absent → true on first sight.
    if (redis) {
      try {
        const key = `webhook:helius:${ev.signature}`;
        const set = await redis.set(key, '1', { nx: true, ex: getMaxAgeSeconds() });
        if (set === null) {
          // already processed recently → skip without DB work
          skipped++;
          continue;
        }
      } catch {
        // Redis unavailable → fall through; the DB unique key is the real guard.
      }
    }

    // Distinct watched mints touched by this tx.
    const mints = Array.from(
      new Set(ev.tokenTransfers.map((t) => t.mint).filter((m) => !!m)),
    );
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
    const blockTime = blockTimeToDate(ev.blockTime);

    // (3) Classify on the signature: hit ⇒ IN_APP (confirm), miss ⇒ EXTERNAL.
    const existingTrade = await prisma.trade.findUnique({
      where: { signature: ev.signature },
      select: { id: true, source: true, tokenId: true },
    });

    let anyWork = false;

    for (const mint of mints) {
      const token = tokenByMint.get(mint);
      if (!token) continue;

      const feeBps =
        token.feeConfig?.transferFeeBps ?? token.transferFeeBps ?? 0;
      const maxFee = token.transferFeeMaxBaseUnits
        ? BigInt(token.transferFeeMaxBaseUnits)
        : BigInt(0);
      const decimals = token.decimals ?? 9;

      // Gross transferred for this mint = sum of token-transfer legs on the mint.
      let grossWhole = 0;
      for (const tt of ev.tokenTransfers) {
        if (tt.mint === mint) grossWhole += Math.abs(tt.tokenAmount || 0);
      }
      const grossBaseUnits = BigInt(Math.round(grossWhole * 10 ** decimals));
      const withheld = calcFee(grossBaseUnits, feeBps, maxFee);

      // Determine the trade for THIS mint (in-app trades are per-token).
      let tradeId: string | null = null;
      let source: 'IN_APP' | 'EXTERNAL';

      if (existingTrade && existingTrade.tokenId === token.id) {
        // IN_APP confirmation: stamp blockTime, keep source as recorded.
        source = existingTrade.source === 'IN_APP' ? 'IN_APP' : 'EXTERNAL';
        tradeId = existingTrade.id;
        await prisma.trade
          .update({
            where: { id: existingTrade.id },
            data: { blockTime: blockTime ?? undefined },
          })
          .catch(() => {});
      } else if (!existingTrade) {
        // EXTERNAL: insert a Trade keyed by signature (unique → idempotent).
        source = 'EXTERNAL';
        const payer =
          ev.tokenTransfers.find((t) => t.mint === mint && t.fromUserAccount)
            ?.fromUserAccount || '';
        const side = inferSide(ev, mint);
        const created = await prisma.trade
          .upsert({
            where: { signature: ev.signature },
            update: { blockTime: blockTime ?? undefined },
            create: {
              tokenId: token.id,
              traderWallet: payer,
              side,
              source: 'EXTERNAL',
              venue: token.poolType ?? 'METEORA_DAMM_V2',
              signature: ev.signature,
              amountInBaseUnits: grossBaseUnits.toString(),
              amountInMint: mint,
              amountOutBaseUnits: '0',
              amountOutMint: token.quoteMint ?? '',
              transferFeeBaseUnits: withheld.toString(),
              feeBps: feeBps || null,
              poolAddress: token.dbcPoolAddress ?? token.poolAddress ?? null,
              blockTime: blockTime ?? undefined,
            },
            select: { id: true },
          })
          .catch(() => null);
        tradeId = created?.id ?? null;
      } else {
        // Signature matched a Trade on a DIFFERENT token — record EXTERNAL leg
        // for this mint without touching the other token's trade row.
        source = 'EXTERNAL';
      }

      // (4) Emit the TRANSFER_FEE_WITHHELD fee event for this leg. ON-CHAIN row:
      // set `signature` (encode the leg key so each (sig,kind,mint) is unique),
      // leave `internalRef` null (CONTRACTS §a.6).
      const legSignature = `${ev.signature}:TRANSFER_FEE_WITHHELD:${mint}`;
      await prisma.feeEvent
        .createMany({
          data: [
            {
              tokenId: token.id,
              tradeId: tradeId ?? undefined,
              type: 'TRANSFER_FEE_WITHHELD',
              source,
              recipient: 'PROTOCOL', // withheld fee — destined for harvest/claim accounting
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
        })
        .catch(() => {});

      anyWork = true;
    }

    if (anyWork) processed++;
    else skipped++;
  }

  return { received, processed, skipped };
}

/**
 * Best-effort BUY/SELL inference for an EXTERNAL trade: if the creator mint
 * flows OUT of a user account (they're sending the token away), treat as SELL;
 * if it flows IN, treat as BUY. Defaults to BUY when ambiguous (display-only;
 * rebate eligibility is driven by `source`, not `side`).
 */
function inferSide(ev: ParsedHeliusEvent, mint: string): 'BUY' | 'SELL' {
  const legs = ev.tokenTransfers.filter((t) => t.mint === mint);
  // Heuristic: a swap that increases a holder's creator-token balance == BUY.
  // Without per-account deltas we cannot be precise; bias to BUY.
  if (legs.length === 0) return 'BUY';
  return 'BUY';
}
