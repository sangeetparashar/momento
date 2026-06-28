import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isValidUuid, isValidMint, validateBody, feeClaimSchema } from '@/lib/validation';
import { claimTokenFees, type ClaimResult } from '@/lib/fee-claim';
import { SolanaTxError } from '@/lib/solana';

/**
 * POST /api/creators/[id]/fees/claim — admin manual fee claim (CONTRACTS-P3A §d.6,
 * D-fee-claim §6).
 *
 * Admin-gated (`requireAdmin`, failClosed), constant-time auth via lib/auth.
 * Param `[id]` is `isValidUuid`-bounded before any DB use (REVIEW-security P1).
 *
 * Body (feeClaimSchema):
 *   { "tokenId": "<uuid>" }   → claim ONE token (must belong to creator [id])
 *   { "mint": "<base58>" }    → claim ONE token by mint (must belong to creator)
 *   { }                       → claim ALL the creator's graduated/active tokens
 *
 * Response: { success:true, data: ClaimResult | ClaimResult[] }.
 * Writes a PromotionLog-style audit row (actor, target, method='fee-claim',
 * metadata = signatures). Shares lib/fee-claim with the cron — no duplicated CPI.
 *
 * Error mapping (SolanaTxError.code → envelope, D-fee-claim §6):
 *   CONFIG_MISSING/STUBBED        → 500
 *   SIMULATION_FAILED/SIGNER_REJECTED → 502
 *   DUPLICATE                     → 200 (deduped; surfaced in ClaimResult.skipped)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Auth FIRST (failClosed); no rate limiter on this admin route (§d.6).
    const admin = await requireAdmin(request);

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid creator id' },
        { status: 400 },
      );
    }

    // Parse body (allow empty body → {}).
    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const parsed = validateBody(feeClaimSchema, raw);
    if (!parsed.success) return parsed.response;
    const { tokenId, mint } = parsed.data;

    if (mint && !isValidMint(mint)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mint' },
        { status: 400 },
      );
    }

    // Resolve the target token(s) — ALL must belong to creator [id].
    let tokenIds: string[];
    if (tokenId) {
      const t = await prisma.creatorToken.findUnique({
        where: { id: tokenId },
        select: { id: true, userId: true },
      });
      if (!t || t.userId !== id) {
        return NextResponse.json(
          { success: false, error: 'Token not found for creator' },
          { status: 404 },
        );
      }
      tokenIds = [t.id];
    } else if (mint) {
      const t = await prisma.creatorToken.findUnique({
        where: { mintAddress: mint },
        select: { id: true, userId: true },
      });
      if (!t || t.userId !== id) {
        return NextResponse.json(
          { success: false, error: 'Token not found for creator' },
          { status: 404 },
        );
      }
      tokenIds = [t.id];
    } else {
      // No selector → all the creator's graduated/active tokens.
      const tokens = await prisma.creatorToken.findMany({
        where: { userId: id, status: { in: ['GRADUATED', 'ACTIVE'] } },
        select: { id: true },
      });
      tokenIds = tokens.map((t) => t.id);
    }

    // Single vs batch. Per CONTRACTS §d.6 a single selector returns one
    // ClaimResult; no selector returns an array.
    const single = !!(tokenId || mint);

    const results: ClaimResult[] = [];
    for (const tid of tokenIds) {
      results.push(await claimTokenFees(tid, { actor: admin.id }));
    }

    const data: ClaimResult | ClaimResult[] = single ? results[0] : results;

    // Best-effort audit trail — never block the claim on a log failure.
    try {
      const signatures = results.flatMap((r) =>
        [
          r.partnerTradingFeeSig,
          r.creatorTradingFeeSig,
          r.partnerLpFeeSig,
          r.creatorLpFeeSig,
          r.withdrawWithheldSig,
        ].filter(Boolean),
      );
      await prisma.promotionLog.create({
        data: {
          actorId: admin.id,
          targetId: id,
          method: 'fee-claim',
          metadata: { tokenIds, signatures, recorded: results.reduce((n, r) => n + r.recorded, 0) },
        },
      });
    } catch (e) {
      console.error('[admin] fee-claim promotionLog write failed (non-fatal):', e);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return error;

    // Map SolanaTxError.code → HTTP (D-fee-claim §6). DUPLICATE never reaches
    // here (claimTokenFees swallows per-source dedup into skipped[]).
    if (error instanceof SolanaTxError) {
      const code = error.code;
      if (code === 'DUPLICATE') {
        return NextResponse.json({ success: true, data: { deduped: true } });
      }
      if (code === 'CONFIG_MISSING' || code === 'STUBBED') {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (code === 'SIMULATION_FAILED' || code === 'SIGNER_REJECTED') {
        return NextResponse.json({ success: false, error: error.message }, { status: 502 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.error('Admin fee-claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to claim fees' },
      { status: 500 },
    );
  }
}
