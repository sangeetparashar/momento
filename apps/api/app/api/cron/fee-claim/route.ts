import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { computeRebate, rebateToUsdc, grossUpTokenRebate } from '@/lib/fees';
import { MOMENTO_FEE } from '@momento/shared';

/**
 * GET /api/cron/fee-claim — partner+creator fee-claim / reconciliation cron
 * (CONTRACTS §e.5, D-fees §7). On the `keep-warm` cron pattern.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, constant-time. Fail-open ONLY
 * when CRON_SECRET is unset (dev), exactly like `keep-warm`. No rate limiter.
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
  // ── Auth (constant-time bearer compare; fail-open only when unset) ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
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

  try {
    // ───────────────────────────────────────────────────────────────────────
    // (1) Reconcile classification + enqueue rebates (D-fees §7.1).
    // `signature` is unique, so the webhook-vs-intent race cannot produce two
    // rows sharing a signature; instead the merge surfaces as a row that is
    // `source=EXTERNAL` yet carries our `intentId` (linked back to a Momento
    // intent). Reclassify those → IN_APP and compute the owed rebate. Operate
    // only on trades not yet rebated so re-runs are idempotent.
    //
    // NOTE: the in-app swap BUILDER that writes intent rows is Phase 4, so in
    // Phase 2 this sweep is a safe no-op until those rows exist — the seam.
    // ───────────────────────────────────────────────────────────────────────
    const toReclassify = await prisma.trade.findMany({
      where: {
        source: 'EXTERNAL',
        intentId: { not: null },
        rebatePaid: false,
      },
      include: { token: { include: { feeConfig: true } } },
      take: 500,
    });

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
      const rebateMint = token?.feeConfig?.rebateMint ?? MOMENTO_FEE.USDC_MINT;
      const useUsdc = rebateMint === MOMENTO_FEE.USDC_MINT;
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

    // TODO(Phase 3): execute Meteora claims via @meteora-ag/dynamic-bonding-curve-sdk
    //   - partner:  claimPartnerTradingFee()  -> fee_claimer = MOMENTO_LP_FEE_CLAIMER
    //   - creator:  creator trading-fee + locked-LP fee claim
    //   - harvest:  harvestWithheldTokensToMint + withdrawWithheldTokensFromMint (spike-a)
    //   - sign with Privy Server Wallet (lib/solana getServerWallet/serverSigner),
    //     self-submit via Helius Sender (lib/solana submit)
    //   - on confirm: insert CLAIMED / PARTNER_TRADING_FEE / CREATOR_TRADING_FEE
    //     FeeEvents keyed by `signature` (claim tx) with attribute2080() split.
    //   Phase 2 ONLY records claims observed via webhook; it does NOT initiate the CPI.
    //
    // `claimsRecorded` stays 0 here: claims land via the webhook ingest path in
    // Phase 2; this cron records them only once the Phase-3 CPI seam above runs.

    // TODO(Phase 4): rebate execution (REBATE FeeEvent rebatePaid PENDING -> SENT)
    //   - read the off-chain REBATE FeeEvents enqueued in (1) (rebatePaid=false)
    //   - USDC default: SPL transfer from MOMENTO_REBATE_USDC_VAULT (fee-exempt)
    //   - token fallback: grossed-up Token-2022 transfer (grossUpTokenRebate)
    //   - on confirm: set Trade.rebatePaid=true, Trade.rebateSignature,
    //     FeeEvent.claimed=true, FeeEvent.claimSignature. Batchable per
    //     trader/token/epoch to amortize fees.

    return NextResponse.json({
      success: true,
      data: { reclassified, rebatesQueued, claimsRecorded, harvestNoted },
    });
  } catch (error) {
    console.error('fee-claim cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Fee-claim cron failed' },
      { status: 500 },
    );
  }
}
