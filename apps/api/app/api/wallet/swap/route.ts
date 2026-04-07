import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getChainParam, getWalletForChain } from '@/lib/auth';
import { readLimiter, writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import { getSwapQuote, buildSwapTransaction, TOKEN_MINTS } from '@/lib/jupiter';
import { getBaseSwapQuote, buildBaseSwapTransaction } from '@/lib/base-swap';

/**
 * GET /api/wallet/swap
 *
 * Fetches a swap quote. Chain is selected via `?chain=base|solana` (default solana).
 *
 * Solana query params:
 *   - inputMint:  token mint address (default: SOL)
 *   - outputMint: token mint address (default: USDC)
 *   - amount:     input amount in smallest unit (lamports for SOL, etc.)
 *   - slippageBps: slippage tolerance (default: 50 = 0.5%)
 *
 * Base query params (sellToken/buyToken/sellAmount, or inputMint/outputMint/amount aliases):
 *   - sellToken / inputMint:  ERC-20 address (or 0xEee...EEeE for native ETH)
 *   - buyToken  / outputMint: ERC-20 address
 *   - sellAmount / amount:    input amount in smallest unit (wei for ETH, raw for ERC-20)
 *   - slippageBps: slippage tolerance (default: 50 = 0.5%)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const chain = getChainParam(request);
    const slippageBps = searchParams.get('slippageBps');

    if (chain === 'base') {
      const sellToken = searchParams.get('sellToken') || searchParams.get('inputMint') || '';
      const buyToken = searchParams.get('buyToken') || searchParams.get('outputMint') || '';
      const sellAmount = searchParams.get('sellAmount') || searchParams.get('amount') || '';

      if (!sellToken || !buyToken || !sellAmount) {
        return NextResponse.json(
          { success: false, error: 'sellToken, buyToken, and sellAmount are required' },
          { status: 400 }
        );
      }

      const takerAddress = getWalletForChain(user, 'base');
      if (!takerAddress) {
        return NextResponse.json(
          { success: false, error: 'No Base wallet found for this user' },
          { status: 400 }
        );
      }

      const quote = await getBaseSwapQuote({
        sellToken,
        buyToken,
        sellAmount,
        slippageBps: slippageBps ? parseInt(slippageBps, 10) : undefined,
        takerAddress,
      });

      return NextResponse.json({ success: true, data: quote });
    }

    // Existing Solana / Jupiter logic — unchanged.
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
 * Builds a swap transaction from a quote response.
 *
 * Solana body:
 *   - quoteResponse: the raw quote from GET /api/wallet/swap
 *   - chain: 'solana' (optional, default)
 *
 * Base body:
 *   - chain: 'base'
 *   - quoteResponse: the raw 0x quote from GET /api/wallet/swap?chain=base
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    const body = await request.json();
    const chain: 'solana' | 'base' = body.chain === 'base' ? 'base' : 'solana';
    const { quoteResponse } = body;

    if (!quoteResponse) {
      return NextResponse.json(
        { success: false, error: 'quoteResponse is required' },
        { status: 400 }
      );
    }

    if (chain === 'base') {
      const walletAddress = getWalletForChain(user, 'base');
      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: 'No Base wallet found for this user' },
          { status: 400 }
        );
      }

      // The quote was tagged with the originating taker inside getBaseSwapQuote.
      // buildBaseSwapTransaction cross-checks that taker against this session
      // wallet and throws if they don't match (HIGH security fix — prevents
      // building one user's quote against another user's wallet).
      const result = await buildBaseSwapTransaction({
        quoteResponse,
        userPublicKey: walletAddress,
      });

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // Existing Solana / Jupiter logic — unchanged.
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
