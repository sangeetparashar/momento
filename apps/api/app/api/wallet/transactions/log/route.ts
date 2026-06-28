import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeLimiter, applyRateLimit } from '@/lib/ratelimit';
import prisma from '@/lib/prisma';
import { invalidateCache, cacheKeys } from '@/lib/redis';

/**
 * POST /api/wallet/transactions/log
 *
 * Logs a confirmed transaction to the server for persistent history.
 * Called by the mobile app after a swap or send succeeds on-chain.
 * Idempotent — duplicate signature+chain+user combos are no-ops.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, writeLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);
    const body = await request.json();

    const { chain, signature, type, label } = body;
    if (!chain || !signature || !type || !label) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: chain, signature, type, label' },
        { status: 400 },
      );
    }

    if (chain !== 'solana') {
      return NextResponse.json(
        { success: false, error: 'Invalid chain. Must be "solana".' },
        { status: 400 },
      );
    }

    const validTypes = ['swap', 'send', 'receive', 'fund'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    // Upsert to be idempotent — same tx won't create duplicates
    const tx = await prisma.walletTransaction.upsert({
      where: {
        userId_chain_signature: {
          userId: user.id,
          chain,
          signature,
        },
      },
      update: {}, // no-op if already exists
      create: {
        userId: user.id,
        chain,
        signature,
        type,
        label,
        inputToken: body.inputToken || null,
        outputToken: body.outputToken || null,
        inputAmount: body.inputAmount || null,
        outputAmount: body.outputAmount || null,
        recipientAddress: body.recipientAddress || null,
        status: body.status || 'confirmed',
      },
    });

    // Invalidate tx history cache for this user+chain
    await invalidateCache(cacheKeys.walletTransactions(user.id, chain)).catch(() => {});

    return NextResponse.json({ success: true, data: { id: tx.id } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Transaction log error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log transaction' },
      { status: 500 },
    );
  }
}
