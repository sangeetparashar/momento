import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runGraduationSweep } from '@/lib/graduation';

/**
 * GET /api/cron/graduate — graduation keeper cron (CONTRACTS-P3A §d.5,
 * D-graduation §4.1). A thin auth shell over `runGraduationSweep()`.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, constant-time. FAIL-CLOSED — a
 * missing/empty CRON_SECRET returns 401 (we never infer "dev" from an absent
 * secret). The ONLY fail-open path is an EXPLICIT dev opt-in
 * (`ALLOW_INSECURE_CRON=1` AND `NODE_ENV !== 'production'`). Mirrors
 * `cron/fee-claim/route.ts` exactly. No rate limiter.
 *
 * The sweep itself is idempotent and NEVER double-migrates: the DB lease
 * (FINALIZING + finalizeStartedAt), the durable submit() Redis store
 * (at-most-once broadcast), and on-chain/unique constraints make overlapping
 * cron ticks safe (D-graduation §5). Suggested cadence: every 5 minutes
 * (latency-sensitive vs the 30-min fee-claim) — added to vercel.json by
 * P3-foundation.
 *
 * Response (envelope-consistent with Phase 2):
 *   { success: true, data: { detected, finalized, retried, failed } }
 */
export async function GET(request: NextRequest) {
  // ── Auth (constant-time bearer compare; FAIL-CLOSED) ──
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    const allowInsecure =
      process.env.ALLOW_INSECURE_CRON === '1' && process.env.NODE_ENV !== 'production';
    if (!allowInsecure) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const authHeader = request.headers.get('authorization') || '';
    const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    // Hash both sides to fixed-width digests so the compare never throws on a
    // length mismatch and does not leak length (mirrors cron/fee-claim).
    const ok = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(presented).digest(),
      crypto.createHash('sha256').update(secret).digest(),
    );
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { detected, finalized, retried, failed } = await runGraduationSweep();
    return NextResponse.json({
      success: true,
      data: { detected, finalized, retried, failed },
    });
  } catch (error) {
    console.error('graduate cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Graduation cron failed' },
      { status: 500 },
    );
  }
}
