import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { swapLimiter, applyRateLimit } from '@/lib/ratelimit';
import { tradeSubmitSchema, isValidMint, validateBody } from '@/lib/validation';
import { SolanaTxError } from '@/lib/solana';
import { submitTrade, TradeError } from '@/lib/trade';

/**
 * POST /api/tokens/[mint]/buy/submit — relay client-signed buy (CONTRACTS-P3A §d.4 / D-trade §3.4).
 *
 * User. Limiter: `swapLimiter`. Self-submits the client-signed tx and patches the
 * Trade { signature, blockTime } so the webhook classifies it IN_APP.
 *
 * 403 if `Trade.userId !== user.id`. Idempotent: a re-submit of the same intent
 * returns the existing signature with `deduped:true`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    const rateLimitResponse = await applyRateLimit(request, swapLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const { mint } = await params;
    if (!isValidMint(mint)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mint address' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validated = validateBody(tradeSubmitSchema, body);
    if (!validated.success) return validated.response;
    const { intentId, transaction, idempotencyKey } = validated.data;

    const result = await submitTrade({
      intentId,
      txBase64: transaction,
      idempotencyKey,
      userId: user.id,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return mapSubmitError(error, 'Failed to submit buy transaction');
  }
}

/**
 * Submit-path error mapping. `WALLET_NOT_READY` from submitTrade means the intent
 * is not the caller's → 403 (D-trade §6). TOKEN_NOT_FOUND → 404. SolanaTxError
 * maps onto the standard relay status codes.
 */
function mapSubmitError(error: unknown, fallback: string): NextResponse | Response {
  if (error instanceof Response) return error;
  if (error && typeof error === 'object' && 'status' in error && 'body' in error) {
    return error as Response;
  }

  if (error instanceof TradeError) {
    const status =
      error.code === 'WALLET_NOT_READY' ? 403 : error.code === 'TOKEN_NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }

  if (error instanceof SolanaTxError) {
    const status =
      error.code === 'SIMULATION_FAILED'
        ? 400
        : error.code === 'INSUFFICIENT_FUNDS'
        ? 402
        : error.code === 'TIMEOUT' || error.code === 'BLOCKHASH_EXPIRED'
        ? 202
        : error.code === 'DUPLICATE'
        ? 409
        : error.code === 'CONFIG_MISSING' || error.code === 'STUBBED'
        ? 500
        : 502;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }

  const message = error instanceof Error ? error.message : fallback;
  console.error('[Trade buy submit] error:', message);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
