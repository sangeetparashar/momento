import { NextRequest, NextResponse } from 'next/server';
import {
  verifyHeliusWebhook,
  parseHeliusBatch,
  ingestHeliusEvents,
  getMaxBatchEvents,
} from '@/lib/helius-webhook';

// Reject bodies larger than this before parsing — a single oversized delivery
// would otherwise exhaust the function and hammer the DB (DoS). 2 MiB is well
// above a normal Helius enhanced-tx batch.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/webhooks/helius — Helius Enhanced Webhook receiver (CONTRACTS §e.1,
 * D-fees §5).
 *
 * Auth: shared secret only (bearer OR HMAC, constant-time) — NO Privy auth, NO
 * rate limiter (machine caller, exactly like `kyc/webhook`). 401 on bad secret.
 *
 * Idempotent by design (Redis SETNX fast-path + DB unique backstop): already-
 * seen / unwatched deliveries are counted as `skipped` and STILL return 200 so
 * Helius does not retry-storm.
 *
 * Verify hashes/compares the RAW body bytes, so read `request.text()` first.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // 0) Bound the body size (DoS guard) before any work.
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Payload too large' },
        { status: 413 },
      );
    }

    // 1) Verify (bearer or HMAC). Do not leak which check failed.
    if (!verifyHeliusWebhook(request, rawBody)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // 2) Parse the lax enhanced-tx array, then bound its cardinality (DoS guard).
    const events = parseHeliusBatch(rawBody);
    if (events.length > getMaxBatchEvents()) {
      return NextResponse.json(
        { success: false, error: 'Too many events in batch' },
        { status: 400 },
      );
    }

    // 3) Ingest: on-chain verify + classify IN_APP/EXTERNAL + persist fee legs.
    //    Unexpected persistence errors surface as 500 so Helius retries (legs are
    //    never silently dropped).
    const result = await ingestHeliusEvents(events);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Helius webhook error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process webhook' },
      { status: 500 },
    );
  }
}
