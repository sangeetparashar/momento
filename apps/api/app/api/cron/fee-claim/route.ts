import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeRebate, rebateToUsdc, grossUpTokenRebate } from '@/lib/fees';
import { runClaimSweep, runRebateSweep } from '@/lib/fee-claim';
import { MOMENTO_FEE, getUsdcMint } from '@momento/shared';

/**
 * Whether the intent-recon sweep should run. FALSE for all of Phase 2: the
 * in-app swap builder that writes Momento intent rows is Phase 4, so there is no
 * intent to reconcile against and the sweep is a deliberate no-op seam (NOT a
 * silently-broken matcher). Phase 4 flips this on (e.g. via `INTENT_RECON=1`)
 * once it backfills `Trade.intentId` on the signature-matched EXTERNAL rows.
 */
function intentReconEnabled(): boolean {
  return process.env.INTENT_RECON === '1';
}

/**
 * GET /api/cron/fee-claim — partner+creator fee-claim / reconciliation cron
 * (CONTRACTS §e.5, D-fees §7). On the `keep-warm` cron pattern.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, constant-time. FAIL-CLOSED: a
 * missing/empty CRON_SECRET returns 401 (REVIEW-security P1) — we never infer
 * "dev" from an absent secret. The ONLY fail-open path is an EXPLICIT dev opt-in
 * (`ALLOW_INSECURE_CRON=1` AND `NODE_ENV !== 'production'`). No rate limiter.
 *
 * Phase 2 responsibilities (accounting + scaffolding ONLY — idempotent, safe on
 * overlapping ticks via the FeeEvent/Trade unique keys):
 *   1. Reconcile classification: EXTERNAL trades whose `signature` now matches a
 *      Momento-built intent → reclassify IN_APP and enqueue the owed REBATE
 *      (off-chain FeeEvent, `internalRef` set, `rebatePaid=false`).
 *   2. Harvest accounting: count TRANSFER_FEE_WITHHELD legs ready to harvest.
 *   3. Claim recording: scaffold (observed claims are recorded via webhook; the
 *      on-chain claim CPI is Phase 3).
 *
 * Phase-3/Phase-4 seams are explicit TODOs below — do NOT implement here.
 */
export async function GET(request: NextRequest) {
  // ── Auth (constant-time bearer compare; FAIL-CLOSED) ──
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // No secret configured. Fail CLOSED unless an EXPLICIT dev opt-in is set —
    // a missing var in a misconfigured prod deploy must NOT expose this
    // state-mutating endpoint (REVIEW-security P1).
    const allowInsecure =
      process.env.ALLOW_INSECURE_CRON === '1' && process.env.NODE_ENV !== 'production';
    if (!allowInsecure) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const authHeader = request.headers.get('authorization') || '';
    const presented = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    // Hash both sides to fixed-width digests so the compare never throws on a
    // length mismatch and does not leak length (mirrors lib/veriff.ts).
    const ok = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(presented).digest(),
      crypto.createHash('sha256').update(secret).digest(),
    );
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  let reclassified = 0;
  let rebatesQueued = 0;
  let claimsRecorded = 0;
  let harvestNoted = 0;
  let rebatesSent = 0;
  let rebatesDeferred = 0;

  try {
    // ───────────────────────────────────────────────────────────────────────
    // (1) Reconcile classification + enqueue rebates (D-fees §7.1).
    //
    // JOIN KEY = `signature` (SPEC §3.3 / REVIEW-correctness P1-1). The race the
    // recon resolves is: the webhook lands an EXTERNAL `Trade` (keyed by
    // `signature`) BEFORE the Momento intent row that proves the same signature
    // was an IN_APP swap WE built. The correct reconciliation is therefore:
    // "find EXTERNAL trades whose `signature` matches a Momento-built intent and
    // reclassify them IN_APP".
    //
    // PHASE-4 DEPENDENCY — DELIBERATE NO-OP SEAM (not a silently-broken matcher):
    // the in-app swap BUILDER that writes intent rows is Phase 4. Until it exists
    // there is no source of Momento intents to join against, so the recon has
    // NOTHING to match and MUST be a no-op. We express that explicitly by gating
    // the whole sweep behind `intentReconEnabled()` (always false in Phase 2)
    // rather than running a predicate that *looks* live but can never fire.
    //
    // When Phase 4 lands, its builder must EITHER (a) backfill `Trade.intentId`
    // onto any pre-existing EXTERNAL row sharing the `signature` (then this query
    // — `source=EXTERNAL AND intentId != null AND rebatePaid=false` — becomes the
    // live matcher, unchanged), OR (b) provide a signature-keyed intent table and
    // this sweep is rewritten to join on `signature`. Either way the join key is
    // `signature`; `intentId` is only the in-row marker the builder must set.
    // Recorded in CONTRACTS §e.5 as the Phase-4 half of the contract.
    // ───────────────────────────────────────────────────────────────────────
    const toReclassify = intentReconEnabled()
      ? await prisma.trade.findMany({
          where: {
            source: 'EXTERNAL',
            // Webhook ingest NEVER sets `intentId` (it only sets `signature`);
            // only the Phase-4 builder does. So this is unsatisfiable in Phase 2.
            intentId: { not: null },
            rebatePaid: false,
          },
          include: { token: { include: { feeConfig: true } } },
          take: 500,
        })
      : [];

    for (const trade of toReclassify) {
      const token = trade.token;
      const feeBps =
        token?.feeConfig?.transferFeeBps ?? token?.transferFeeBps ?? MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;
      const targetBps = token?.feeConfig?.rebateTargetBps ?? MOMENTO_FEE.TARGET_IN_APP_BPS;
      const maxFee = token?.transferFeeMaxBaseUnits
        ? BigInt(token.transferFeeMaxBaseUnits)
        : BigInt(0);

      let grossBaseUnits: bigint;
      try {
        grossBaseUnits = BigInt(trade.amountInBaseUnits || '0');
      } catch {
        grossBaseUnits = BigInt(0);
      }

      const { rebateOwedNet } = computeRebate({
        grossBaseUnits,
        feeBps,
        targetBps,
        maxFeeBaseUnits: maxFee,
      });

      // Default rebate path = USDC (fee-exempt). Fallback = grossed-up token.
      // We record the computed amount + mint on the Trade so the Phase-4 payout
      // worker is a thin executor. NO on-chain send here.
      // Resolve USDC at request time (active cluster) — never the frozen mainnet
      // literal, else a devnet-USDC rebate mint fails the comparison and mis-routes
      // down the Token-2022 gross-up path (G-2).
      const usdcMint = getUsdcMint();
      const rebateMint = token?.feeConfig?.rebateMint ?? usdcMint;
      const useUsdc = rebateMint === usdcMint || rebateMint === MOMENTO_FEE.USDC_MINT;
      const decimals = token?.decimals ?? 9;

      let rebateBaseUnits: bigint;
      if (rebateOwedNet <= BigInt(0)) {
        rebateBaseUnits = BigInt(0);
      } else if (useUsdc) {
        // Price snapshot at fill (priceUsd) → USDC base units (no gross-up).
        rebateBaseUnits = rebateToUsdc(rebateOwedNet, trade.priceUsd ?? 0, decimals);
      } else {
        // Token fallback: gross up so the trader nets `rebateOwedNet`.
        rebateBaseUnits = grossUpTokenRebate(rebateOwedNet, feeBps);
      }

      // Reclassify the trade to IN_APP and record the owed rebate (still unpaid).
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          source: 'IN_APP',
          rebateBaseUnits: rebateBaseUnits.toString(),
          rebateMint,
        },
      });
      reclassified++;

      // Enqueue the REBATE accrual as an OFF-CHAIN FeeEvent: set `internalRef`,
      // leave `signature` null (CONTRACTS §a.6). Idempotent via the unique
      // `internalRef` (`${tradeId}:${recipient}:${type}`); re-runs are no-ops.
      if (rebateBaseUnits > BigInt(0)) {
        const internalRef = `${trade.id}:TRADER:REBATE`;
        const inserted = await prisma.feeEvent.createMany({
          data: [
            {
              tokenId: trade.tokenId,
              tradeId: trade.id,
              type: 'REBATE',
              source: 'IN_APP',
              recipient: 'TRADER',
              recipientWallet: trade.traderWallet,
              grossBaseUnits: '0',
              feeBaseUnits: rebateBaseUnits.toString(),
              netBaseUnits: rebateBaseUnits.toString(),
              amountMint: rebateMint,
              amountUsd: trade.priceUsd ?? null,
              internalRef,
            },
          ],
          skipDuplicates: true,
        });
        rebatesQueued += inserted.count;
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // (2) Harvest accounting: count TRANSFER_FEE_WITHHELD legs not yet claimed
    // (i.e. withheld fees that still need harvest+withdraw). Phase 2 only NOTES
    // the intent; the actual harvest/withdraw CPI is wired in Phase 3/4.
    // ───────────────────────────────────────────────────────────────────────
    harvestNoted = await prisma.feeEvent.count({
      where: { type: 'TRANSFER_FEE_WITHHELD', claimed: false },
    });

    // ───────────────────────────────────────────────────────────────────────
    // (3) Phase-3 CLAIM seam (D-fee-claim §3, §7). Execute Meteora DBC partner/
    // creator trading-fee + DAMM v2 locked-LP fee claims and Token-2022 withheld
    // harvest/withdraw via lib/fee-claim.runClaimSweep — Privy server-signed,
    // self-submitted via Helius Sender (lib/solana). Idempotent + safe on
    // overlapping ticks: each claim is keyed in the durable idempotency store and
    // the CLAIMED / accrual FeeEvent rows are unique. DEFAULT-OFF env gate
    // (FEE_CLAIM_ENABLED) keeps this a no-op until ops flips it on.
    // ───────────────────────────────────────────────────────────────────────
    if (process.env.FEE_CLAIM_ENABLED === '1') {
      try {
        const sweep = await runClaimSweep();
        for (const r of sweep.results) claimsRecorded += r.recorded;
      } catch (e) {
        // A sweep-level failure must not 500 the whole cron (the recon + harvest
        // accounting above already succeeded). Log + continue.
        console.error('fee-claim cron: claim sweep failed:', e);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // (4) Phase-4 REBATE seam (D-fee-claim §4, §7). Pay unpaid IN_APP rebates
    // (USDC default; reserve-before-send anti-double-pay) via
    // lib/fee-claim.runRebateSweep. DOUBLE-GATED: REBATE_SEND_ENABLED AND the
    // BLOCKING compliance gate REBATE_LEGAL_APPROVED — both default OFF, so prod
    // rebate disbursement stays a no-op until ops + legal flip them (REVIEW §6).
    // ───────────────────────────────────────────────────────────────────────
    if (process.env.REBATE_SEND_ENABLED === '1' && process.env.REBATE_LEGAL_APPROVED === '1') {
      try {
        const rebates = await runRebateSweep();
        rebatesSent += rebates.sent;
        // Surface owed-but-not-sent rebates (no usable price / wallet cap reached)
        // so a real obligation that we declined to size off a bad price is visible.
        rebatesDeferred += rebates.deferred;
        if (rebates.deferred > 0) {
          console.warn(`fee-claim cron: ${rebates.deferred} rebate(s) deferred (no usable price / wallet cap)`);
        }
      } catch (e) {
        console.error('fee-claim cron: rebate sweep failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      data: { reclassified, rebatesQueued, claimsRecorded, harvestNoted, rebatesSent, rebatesDeferred },
    });
  } catch (error) {
    console.error('fee-claim cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Fee-claim cron failed' },
      { status: 500 },
    );
  }
}
