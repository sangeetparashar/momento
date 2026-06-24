import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getWalletForChain } from '@/lib/auth';
import { swapLimiter, applyRateLimit } from '@/lib/ratelimit';
import { tradeOrderSchema, isValidMint, validateBody } from '@/lib/validation';
import { buildUnsignedForClient, SolanaTxError } from '@/lib/solana';
import {
  resolveTradeVenue,
  getTradeQuote,
  buildTrade,
  TradeError,
} from '@/lib/trade';
import { TradeSide } from '@momento/shared';

/**
 * POST /api/tokens/[mint]/sell — build sell intent (CONTRACTS-P3A §d.3 / D-trade §3.3).
 *
 * User. Limiter: `swapLimiter` (5/min). Mirror of /buy: builds the UNSIGNED
 * Meteora swap tx and persists the IN_APP Trade intent.
 *
 * SELL: inputMint = creator token (the `inputMint` body field is ignored — sells
 * always spend the token); output = USDC (quote). `swapBaseForQuote = true`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  try {
    // Auth FIRST so the swap cap is keyed to the verified userId, not a
    // spoofable x-forwarded-for IP. IP-keyed pre-auth limits let an authed user
    // rotate XFF for a fresh bucket per request (defeating the 5/min cap →
    // rebate / raise farming) and let unauth traffic pre-burn a NAT's bucket.
    // failClosed: a Redis outage must not silently disable the money-path cap.
    const user = await requireAuth(request);
    const rateLimitResponse = await applyRateLimit(request, swapLimiter, user.id, {
      failClosed: true,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { mint } = await params;
    if (!isValidMint(mint)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mint address' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validated = validateBody(tradeOrderSchema, body);
    if (!validated.success) return validated.response;
    const { amountInBase, slippageBps } = validated.data;

    // Wallet gate (D-trade §3.2): null / pending- ⇒ 400 "Wallet not ready".
    const traderWallet = getWalletForChain(user);
    if (!traderWallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet not ready. Please try again in a moment.' },
        { status: 400 },
      );
    }

    const side = TradeSide.SELL;
    const amountInBaseUnits = BigInt(amountInBase);

    const token = await resolveTradeVenue(mint);
    const quote = await getTradeQuote({ token, side, amountInBaseUnits, slippageBps });
    const { intentId, built, quote: finalQuote } = await buildTrade({
      token,
      side,
      userId: user.id,
      traderWallet,
      amountInBaseUnits,
      slippageBps,
      quote,
    });

    const { txBase64, idempotencyKey } = await buildUnsignedForClient(built);

    return NextResponse.json({
      success: true,
      data: {
        intentId,
        transaction: txBase64,
        idempotencyKey,
        venue: finalQuote.venue,
        quote: {
          expectedOutBase: finalQuote.expectedOutBaseUnits,
          minOutBase: finalQuote.minOutBaseUnits,
          priceUsd: finalQuote.priceUsd,
          priceTs: finalQuote.priceTs,
          feeBase: finalQuote.transferFeeBaseUnits,
          feeBps: finalQuote.feeBps,
          effectiveFeeBps: finalQuote.effectiveFeeBps,
          inAppRebateBase: finalQuote.rebateBaseUnits,
          rebateMint: finalQuote.rebateMint,
        },
      },
    });
  } catch (error) {
    return mapTradeError(error, 'Failed to build sell transaction');
  }
}

/**
 * Map errors to the {success,error} envelope. Re-throws Response (auth/validation
 * threw a Response); maps TradeError codes and SolanaTxError.code; else 500.
 */
function mapTradeError(error: unknown, fallback: string): NextResponse | Response {
  if (error instanceof Response) return error;
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'body' in error
  ) {
    return error as Response;
  }

  if (error instanceof TradeError) {
    const status =
      error.code === 'TOKEN_NOT_FOUND'
        ? 404
        : error.code === 'TOKEN_NOT_TRADEABLE' || error.code === 'VENUE_UNRESOLVED'
        ? 409
        : error.code === 'QUOTE_STALE'
        ? 409
        : error.code === 'WALLET_NOT_READY'
        ? 400
        : 400; // AMOUNT_INVALID | SLIPPAGE
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
  console.error('[Trade sell] error:', message);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
