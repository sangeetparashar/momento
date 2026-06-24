import { NextRequest, NextResponse } from 'next/server';
import {
  verifyHeliusWebhook,
  parseHeliusBatch,
  ingestHeliusEvents,
} from '@/lib/helius-webhook';

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

    // 1) Verify (bearer or HMAC). Do not leak which check failed.
    if (!verifyHeliusWebhook(request, rawBody)) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // 2) Parse the lax enhanced-tx array.
    const events = parseHeliusBatch(rawBody);

    // 3) Ingest idempotently (classify IN_APP/EXTERNAL + persist fee legs).
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
