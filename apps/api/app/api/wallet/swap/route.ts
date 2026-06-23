import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { getSwapQuote, buildSwapTransaction, TOKEN_MINTS } from '@/lib/jupiter';

/**
 * GET /api/wallet/swap
 *
 * Fetches a Solana swap quote via Jupiter.
 *
 * Query params:
 *   - inputMint:  token mint address (default: SOL)
 *   - outputMint: token mint address (default: USDC)
 *   - amount:     input amount in smallest unit (lamports for SOL, etc.)
 *   - slippageBps: slippage tolerance (default: 50 = 0.5%)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const slippageBps = searchParams.get('slippageBps');

    const inputMint = searchParams.get('inputMint') || TOKEN_MINTS.SOL;
    const outputMint = searchParams.get('outputMint') || TOKEN_MINTS.USDC;
    const amount = searchParams.get('amount');

    if (!amount) {
      return NextResponse.json(
        { success: false, error: 'amount is required' },
        { status: 400 }
      );
    }

    const quote = await getSwapQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps ? parseInt(slippageBps, 10) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    // requireAuth throws a Response but instanceof can fail across realms
    if (error && typeof error === 'object' && 'status' in error && 'body' in error) {
      return error as Response;
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch swap quote';
    console.error('[Swap] Quote error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet/swap
 *
 * Builds a Solana swap transaction from a quote response.
 *
 * Body:
 *   - quoteResponse: the raw quote from GET /api/wallet/swap
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const body = await request.json();
    const { quoteResponse } = body;

    if (!quoteResponse) {
      return NextResponse.json(
        { success: false, error: 'quoteResponse is required' },
        { status: 400 }
      );
    }

    if (!user.walletAddress || user.walletAddress.startsWith('pending-')) {
      return NextResponse.json(
        { success: false, error: 'Wallet not ready. Please try again in a moment.' },
        { status: 400 }
      );
    }

    const result = await buildSwapTransaction({
      quoteResponse,
      userPublicKey: user.walletAddress,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to build swap transaction';
    console.error('[Swap] Build transaction error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
