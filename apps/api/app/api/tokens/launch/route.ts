/**
 * POST /api/tokens/launch — Creator-gated creator-token launch (P3-launch).
 * CONTRACTS-P3A §d.1 / D-launch §5.
 *
 * Order (mirrors the existing routes / §d preamble):
 *   applyRateLimit(writeLimiter) -> requireCreator -> validateBody(launchTokenSchema)
 *   -> wallet-ready gate -> one-token-per-creator guard (409)
 *   -> launchCreatorToken(...) -> { success, data } envelope.
 *
 * Server-signed platform action (default): returns landed signatures + ACTIVE
 * status (D-launch §5 deviation note). Error mapping is by SolanaTxError.code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCreator } from '@/lib/auth';
import { applyRateLimit, writeLimiter } from '@/lib/ratelimit';
import { launchTokenSchema, validateBody } from '@/lib/validation';
import { launchCreatorToken } from '@/lib/launch';
import { SolanaTxError } from '@/lib/solana';
import prisma from '@/lib/prisma';

/** Map a SolanaTxError.code onto the HTTP status per §d.1. */
function statusForCode(code: string): number {
  switch (code) {
    case 'SIMULATION_FAILED':
      return 400;
    case 'INSUFFICIENT_FUNDS':
      return 402;
    case 'TIMEOUT':
    case 'BLOCKHASH_EXPIRED':
      return 202; // retriable — status DEPLOYING
    case 'DUPLICATE':
      return 200; // dedup → prior result
    case 'CONFIG_MISSING':
    case 'STUBBED':
    case 'SIGNER_REJECTED':
    case 'PARTIAL_SIGN_UNSUPPORTED':
    case 'RPC_ERROR':
    case 'TIP_TOO_LOW':
    case 'UNKNOWN':
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth FIRST (Creator role required; throws a Response on failure) so the
    //    write cap is keyed to the verified userId, not a spoofable
    //    x-forwarded-for IP. IP-keyed pre-auth limits let an authed user rotate
    //    XFF for a fresh bucket per request (defeating the cap on this
    //    fund-moving, one-token-per-creator route) and let unauth traffic
    //    pre-burn a NAT's bucket. failClosed: a Redis outage must not silently
    //    disable the money-path cap. (Matches the 4 trade routes.)
    const user = await requireCreator(request);

    // 2. Rate limit (write), per-user, fail-closed.
    const rateLimited = await applyRateLimit(request, writeLimiter, user.id, {
      failClosed: true,
    });
    if (rateLimited) return rateLimited;

    // 3. Validate body.
    const body = await request.json().catch(() => ({}));
    const parsed = validateBody(launchTokenSchema, body);
    if (!parsed.success) return parsed.response;
    const input = parsed.data;

    // 4. Wallet-ready gate.
    if (!user.walletAddress || user.walletAddress.startsWith('pending-')) {
      return NextResponse.json(
        { success: false, error: 'Wallet not ready. Please try again in a moment.' },
        { status: 400 },
      );
    }

    // 5. One-token-per-creator guard (@@unique([userId, chain]) — pre-check for a
    //    clean 409 instead of a DB unique-violation). DUPLICATE of an in-flight /
    //    completed launch resolves inside launchCreatorToken (idempotent → 200).
    const existing = await prisma.creatorToken.findUnique({
      where: { userId_chain: { userId: user.id, chain: 'solana' } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'PENDING' && existing.status !== 'DEPLOYING') {
      // ACTIVE / GRADUATED already own the creator's slot; FAILED needs ops review.
      if (existing.status === 'ACTIVE' || existing.status === 'GRADUATED' || existing.status === 'FAILED') {
        return NextResponse.json(
          { success: false, error: 'Creator already has a launched token.' },
          { status: 409 },
        );
      }
    }

    // 6. Orchestrate the launch (idempotent; resumes PENDING/DEPLOYING rows).
    const result = await launchCreatorToken({
      creatorUserId: user.id,
      creatorWallet: user.walletAddress,
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      imageUrl: input.imageUrl,
      totalSupply: input.totalSupply,
      decimals: input.decimals,
      transferFeeBps: input.transferFeeBps,
      creatorTradingFeeBps: input.feeSplit.creatorBps,
      partnerTradingFeeBps: input.feeSplit.partnerBps,
      fundraise: {
        targetUsd: input.fundraise.targetUsd,
        initialMarketCapUsd: input.fundraise.initialMarketCapUsd,
        partnerLockedLpPct: input.fundraise.partnerLockedLpPct,
        partnerLpPct: input.fundraise.partnerLpPct,
        creatorLockedLpPct: input.fundraise.creatorLockedLpPct,
        creatorLpPct: input.fundraise.creatorLpPct,
        minContributionBaseUnits: input.fundraise.minContributionBaseUnits,
        maxContributionBaseUnits: input.fundraise.maxContributionBaseUnits,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // requireCreator / validation throw a Response — return as-is (cross-realm safe).
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error && 'body' in error) {
      return error as Response;
    }

    if (error instanceof SolanaTxError) {
      const status = statusForCode(error.code);
      // TIMEOUT / BLOCKHASH_EXPIRED → 202 with DEPLOYING (the launch may still land
      // and is resumable via a re-call; idempotency dedups the broadcast).
      if (status === 202) {
        return NextResponse.json(
          { success: false, error: error.message, code: error.code, status: 'DEPLOYING' },
          { status },
        );
      }
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status },
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to launch token';
    console.error('[Launch] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
