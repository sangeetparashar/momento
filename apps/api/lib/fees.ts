/**
 * apps/api/lib/fees.ts — T-fees (CONTRACTS.md §b.11)
 * ============================================================================
 * Fee / rebate math + 20/80 attribution + read-model aggregation over
 * `Trade` / `FeeEvent` (committed by T-foundation).
 *
 * Money is base-unit `bigint` for the math layer and base-unit *strings* at the
 * persistence / wire boundary (CONTRACTS §e). USD / display values are numbers.
 *
 * The integer/floor math here REPLICATES the on-chain Token-2022 transfer-fee
 * calculation and the rebate gross-up proven on devnet in
 * `scripts/spikes/spike-a-token2022-fee-rebate.ts` (§3.2, §6 of D-fees.md).
 *
 * Default rebate path = USDC (fee-exempt). `grossUpTokenRebate` is the
 * documented FALLBACK only (rebate paid in the creator token re-incurs the
 * transfer fee — see CONTRACTS / D-fees §3).
 */

import prisma from './prisma';
import { MOMENTO_FEE } from '@momento/shared';

// ── small bigint helpers ──────────────────────────────────────────────────
const BPS_DENOM = BigInt(10_000);

function toBigInt(v: string | bigint | number | null | undefined): bigint {
  if (v === null || v === undefined) return BigInt(0);
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (v === '') return BigInt(0);
  try {
    return BigInt(v);
  } catch {
    return BigInt(0);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Rebate math (verified in spike-a)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Off-chain mirror of the on-chain Token-2022 transfer-fee calc:
 * `floor(gross * feeBps / 10_000)`, capped at `maxFeeBaseUnits`.
 * (spike-a `calcFee`.) A `maxFeeBaseUnits` of 0 is treated as "no cap".
 */
export function calcFee(
  grossBaseUnits: bigint,
  feeBps: number,
  maxFeeBaseUnits: bigint,
): bigint {
  if (grossBaseUnits <= BigInt(0) || feeBps <= 0) return BigInt(0);
  const fee = (grossBaseUnits * BigInt(feeBps)) / BPS_DENOM; // integer floor
  if (maxFeeBaseUnits > BigInt(0) && fee > maxFeeBaseUnits) return maxFeeBaseUnits;
  return fee;
}

/**
 * Compute the net rebate owed so an IN_APP trade nets `targetBps` instead of
 * the full `feeBps` (spike-a §6).
 *   chargedFee     = calcFee(gross, feeBps, maxFee)
 *   targetFee      = calcFee(gross, targetBps, maxFee)
 *   rebateOwedNet  = max(0, chargedFee - targetFee)   // value the trader gets back
 */
export function computeRebate(input: {
  grossBaseUnits: bigint;
  feeBps: number;
  targetBps: number;
  maxFeeBaseUnits: bigint;
}): { chargedFee: bigint; targetFee: bigint; rebateOwedNet: bigint } {
  const { grossBaseUnits, feeBps, targetBps, maxFeeBaseUnits } = input;
  const chargedFee = calcFee(grossBaseUnits, feeBps, maxFeeBaseUnits);
  const targetFee = calcFee(grossBaseUnits, targetBps, maxFeeBaseUnits);
  const diff = chargedFee - targetFee;
  const rebateOwedNet = diff > BigInt(0) ? diff : BigInt(0);
  return { chargedFee, targetFee, rebateOwedNet };
}

/**
 * FALLBACK path (token rebate). The rebate transfer itself incurs `feeBps`, so
 * we gross up the send so the trader NETS `rebateOwedNet`:
 *   grossRebate = ceil(net * 10_000 / (10_000 - feeBps))
 * Exact integer ceil verified in spike-a §6. Returns `rebateOwedNet` unchanged
 * when `feeBps <= 0` (no fee to gross up). DEFAULT path is USDC — prefer that.
 */
export function grossUpTokenRebate(rebateOwedNet: bigint, feeBps: number): bigint {
  if (rebateOwedNet <= BigInt(0)) return BigInt(0);
  if (feeBps <= 0) return rebateOwedNet;
  const denom = BPS_DENOM - BigInt(feeBps);
  if (denom <= BigInt(0)) return rebateOwedNet; // degenerate (>=100% fee) — guard
  // ceil(net * 10_000 / denom)
  return (rebateOwedNet * BPS_DENOM + (denom - BigInt(1))) / denom;
}

/**
 * DEFAULT path: convert a token-denominated net rebate to USDC base units.
 * USDC is fee-exempt so there is NO gross-up.
 *   tokenWhole = rebateOwedNet / 10^tokenDecimals
 *   usdc       = floor(tokenWhole * price * 10^USDC_DECIMALS)
 * Computed in floating point for the price multiply, then floored to USDC base
 * units (6 dp). `priceTs` on the Trade lets the recon job true-up.
 */
export function rebateToUsdc(
  rebateOwedNet: bigint,
  tokenToUsdcPrice: number,
  tokenDecimals: number,
): bigint {
  if (rebateOwedNet <= BigInt(0) || tokenToUsdcPrice <= 0) return BigInt(0);
  const tokenWhole = Number(rebateOwedNet) / 10 ** tokenDecimals;
  const usdcWhole = tokenWhole * tokenToUsdcPrice;
  const usdcBase = Math.floor(usdcWhole * 10 ** MOMENTO_FEE.USDC_DECIMALS);
  return usdcBase > 0 ? BigInt(usdcBase) : BigInt(0);
}

// ════════════════════════════════════════════════════════════════════════════
//  20/80 attribution
// ════════════════════════════════════════════════════════════════════════════

export interface FeeSplit {
  protocolBaseUnits: string;
  partnerBaseUnits: string;
  creatorBaseUnits: string;
}

/**
 * Split a fee dollar 20/80: protocol takes a FIXED 20% (Meteora, recorded — not
 * configurable), the remaining 80% is split partner(Momento)/creator by their
 * trading-fee bps (which sum to 10_000). Default 50/50 → 40/40/20 of the whole.
 * Integer floor on each leg; any rounding remainder is given to the creator so
 * the three legs sum EXACTLY to `feeBaseUnits` (no dust lost).
 */
export function attribute2080(
  feeBaseUnits: bigint,
  creatorTradingFeeBps: number,
  partnerTradingFeeBps: number,
): FeeSplit {
  if (feeBaseUnits <= BigInt(0)) {
    return { protocolBaseUnits: '0', partnerBaseUnits: '0', creatorBaseUnits: '0' };
  }

  const protocolBps = BigInt(MOMENTO_FEE.PROTOCOL_FEE_BPS); // 2000 fixed
  const protocol = (feeBaseUnits * protocolBps) / BPS_DENOM; // floor
  const remaining80 = feeBaseUnits - protocol; // the 80% LP leg

  const cBps = BigInt(Math.max(0, creatorTradingFeeBps));
  const pBps = BigInt(Math.max(0, partnerTradingFeeBps));
  const sumBps = cBps + pBps;

  let partner: bigint;
  let creator: bigint;
  if (sumBps <= BigInt(0)) {
    // degenerate config — give it all to partner, none to creator
    partner = remaining80;
    creator = BigInt(0);
  } else {
    partner = (remaining80 * pBps) / sumBps; // floor
    creator = remaining80 - partner; // remainder → creator (no dust lost)
  }

  return {
    protocolBaseUnits: protocol.toString(),
    partnerBaseUnits: partner.toString(),
    creatorBaseUnits: creator.toString(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Range helpers (shared by the summary read models — CONTRACTS §e.2/e.3/e.4)
// ════════════════════════════════════════════════════════════════════════════

export type FeeRange = '24H' | '7D' | '1M' | '3M' | '1Y' | 'ALL';

/** Lower-bound Date for a range, or null for ALL. */
export function rangeStart(range: string): Date | null {
  const now = Date.now();
  const DAY = 86_400_000;
  switch (range) {
    case '24H':
      return new Date(now - DAY);
    case '7D':
      return new Date(now - 7 * DAY);
    case '1M':
      return new Date(now - 30 * DAY);
    case '3M':
      return new Date(now - 90 * DAY);
    case '1Y':
      return new Date(now - 365 * DAY);
    case 'ALL':
    default:
      return null;
  }
}

function unixSeconds(d: Date | null | undefined): number {
  if (!d) return 0;
  return Math.floor(d.getTime() / 1000);
}

// ════════════════════════════════════════════════════════════════════════════
//  Summary aggregation (read model over Trade / FeeEvent)
// ════════════════════════════════════════════════════════════════════════════

export interface TokenFeeSummary {
  mint: string;
  range: string;
  transferFeeBps: number;
  feesGeneratedUsd: number;
  feesGeneratedBase: string;
  split: { creatorBps: number; momentoBps: number };
  claimable?: {
    creatorUsd: number;
    creatorBase: string;
    momentoUsd: number;
    momentoBase: string;
    lastClaimAt: number | null;
  };
}

export interface TokenTradeSummary {
  mint: string;
  range: string;
  summary: {
    priceUsd: number;
    priceChangePct: number;
    volumeUsd: number;
    volumeBase: string;
    buyCount: number;
    sellCount: number;
    uniqueTraders: number;
    high: number;
    low: number;
  };
  series: Array<{ t: number; p: number; v: number }>;
  recent: Array<{
    signature: string;
    t: number;
    side: 'buy' | 'sell';
    amountBase: string;
    amountUsd: number;
    priceUsd: number;
    trader: string;
  }>;
}

/** Resolve the CreatorToken (+ feeConfig) for a mint address. */
async function tokenByMint(mint: string) {
  return prisma.creatorToken.findUnique({
    where: { mintAddress: mint },
    include: { feeConfig: true },
  });
}

/**
 * Per-token fee summary (CONTRACTS §e.3 / §b.11). Public subset is always
 * returned; `claimable` is added only when `opts.includeClaimable` (owner/admin
 * — the route enforces who that is).
 *
 * `feesGenerated*` aggregates the gross fee legs attributed to the token's
 * creator + partner (Momento) — i.e. the fee value that flows to Momento+creator
 * (excludes the protocol's withheld 20%). `claimable` sums the unclaimed
 * CREATOR_TRADING_FEE / PARTNER_TRADING_FEE / LOCKED_LP_FEE accrual rows.
 */
export async function getTokenFeeSummary(
  mint: string,
  range: string,
  opts?: { includeClaimable?: boolean },
): Promise<TokenFeeSummary> {
  const token = await tokenByMint(mint);
  const start = rangeStart(range);

  const transferFeeBps =
    token?.feeConfig?.transferFeeBps ??
    token?.transferFeeBps ??
    MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;

  const creatorTradingFeeBps =
    token?.feeConfig?.creatorTradingFeeBps ?? MOMENTO_FEE.DEFAULT_CREATOR_TRADING_FEE_BPS;
  const partnerTradingFeeBps =
    token?.feeConfig?.partnerTradingFeeBps ?? MOMENTO_FEE.DEFAULT_PARTNER_TRADING_FEE_BPS;

  const empty: TokenFeeSummary = {
    mint,
    range,
    transferFeeBps,
    feesGeneratedUsd: 0,
    feesGeneratedBase: '0',
    split: {
      // effective bps of the WHOLE fee dollar (80% * trading-fee-share)
      creatorBps: Math.round((10_000 - MOMENTO_FEE.PROTOCOL_FEE_BPS) * (creatorTradingFeeBps / 10_000)),
      momentoBps: Math.round((10_000 - MOMENTO_FEE.PROTOCOL_FEE_BPS) * (partnerTradingFeeBps / 10_000)),
    },
  };
  if (opts?.includeClaimable) {
    empty.claimable = {
      creatorUsd: 0,
      creatorBase: '0',
      momentoUsd: 0,
      momentoBase: '0',
      lastClaimAt: null,
    };
  }
  if (!token) return empty;

  // Fee legs that count toward "fees generated" for this token: the creator +
  // partner (Momento) trading-fee accruals and locked-LP fees.
  const feeEvents = await prisma.feeEvent.findMany({
    where: {
      tokenId: token.id,
      recipient: { in: ['CREATOR', 'PLATFORM'] },
      type: { in: ['CREATOR_TRADING_FEE', 'PARTNER_TRADING_FEE', 'LOCKED_LP_FEE'] },
      ...(start ? { createdAt: { gte: start } } : {}),
    },
    select: {
      recipient: true,
      grossBaseUnits: true,
      feeBaseUnits: true,
      amountUsd: true,
      claimed: true,
      claimedAt: true,
    },
  });

  let feesGeneratedBase = BigInt(0);
  let feesGeneratedUsd = 0;
  let creatorClaimableBase = BigInt(0);
  let creatorClaimableUsd = 0;
  let momentoClaimableBase = BigInt(0);
  let momentoClaimableUsd = 0;
  let lastClaimAt: number | null = null;

  for (const ev of feeEvents) {
    const fee = toBigInt(ev.feeBaseUnits);
    feesGeneratedBase += fee;
    feesGeneratedUsd += ev.amountUsd ?? 0;

    if (!ev.claimed) {
      if (ev.recipient === 'CREATOR') {
        creatorClaimableBase += fee;
        creatorClaimableUsd += ev.amountUsd ?? 0;
      } else if (ev.recipient === 'PLATFORM') {
        momentoClaimableBase += fee;
        momentoClaimableUsd += ev.amountUsd ?? 0;
      }
    } else if (ev.claimedAt) {
      const t = unixSeconds(ev.claimedAt);
      if (lastClaimAt === null || t > lastClaimAt) lastClaimAt = t;
    }
  }

  const result: TokenFeeSummary = {
    ...empty,
    transferFeeBps,
    feesGeneratedUsd,
    feesGeneratedBase: feesGeneratedBase.toString(),
  };

  if (opts?.includeClaimable) {
    result.claimable = {
      creatorUsd: creatorClaimableUsd,
      creatorBase: creatorClaimableBase.toString(),
      momentoUsd: momentoClaimableUsd,
      momentoBase: momentoClaimableBase.toString(),
      lastClaimAt,
    };
  }

  return result;
}

/**
 * Per-token trade summary (CONTRACTS §e.2 / §b.11). Public. Aggregates `Trade`
 * rows over the range: OHLC-ish price stats, buy/sell counts, unique traders, a
 * coarse time series, and the most-recent `limit` trades.
 */
export async function getTokenTradeSummary(
  mint: string,
  range: string,
  limit: number = 50,
): Promise<TokenTradeSummary> {
  const token = await tokenByMint(mint);
  const start = rangeStart(range);
  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 50), 200);

  const empty: TokenTradeSummary = {
    mint,
    range,
    summary: {
      priceUsd: 0,
      priceChangePct: 0,
      volumeUsd: 0,
      volumeBase: '0',
      buyCount: 0,
      sellCount: 0,
      uniqueTraders: 0,
      high: 0,
      low: 0,
    },
    series: [],
    recent: [],
  };
  if (!token) return empty;

  // Only confirmed trades (those with a blockTime). When a range start exists,
  // bound it; otherwise just require blockTime to be set.
  const blockTimeFilter = start ? { gte: start } : { not: null };
  const where = { tokenId: token.id, blockTime: blockTimeFilter };

  // Pull trades ascending for series/stats.
  const trades = await prisma.trade.findMany({
    where,
    orderBy: { blockTime: 'asc' },
    select: {
      signature: true,
      side: true,
      amountInBaseUnits: true,
      amountInMint: true,
      priceUsd: true,
      blockTime: true,
      traderWallet: true,
    },
  });

  if (trades.length === 0) return empty;

  let volumeBase = BigInt(0);
  let volumeUsd = 0;
  let buyCount = 0;
  let sellCount = 0;
  let high = 0;
  let low = Number.POSITIVE_INFINITY;
  const traders = new Set<string>();
  let firstPrice = 0;
  let lastPrice = 0;

  // Coarse bucketed series (per day for long ranges, per hour for <= 7D).
  const bucketSec = range === '24H' || range === '7D' ? 3600 : 86_400;
  const buckets = new Map<number, { p: number; v: number }>();

  for (const tr of trades) {
    const amountBase = toBigInt(tr.amountInBaseUnits);
    volumeBase += amountBase;

    const price = tr.priceUsd ?? 0;
    // amount in whole tokens × price ≈ trade USD (display-only)
    const amountWhole = Number(amountBase) / 10 ** (token.decimals ?? 9);
    const usd = price > 0 ? amountWhole * price : 0;
    volumeUsd += usd;

    if (tr.side === 'BUY') buyCount++;
    else sellCount++;

    if (tr.traderWallet) traders.add(tr.traderWallet);

    if (price > 0) {
      if (firstPrice === 0) firstPrice = price;
      lastPrice = price;
      if (price > high) high = price;
      if (price < low) low = price;
    }

    if (tr.blockTime) {
      const ts = unixSeconds(tr.blockTime);
      const bucket = Math.floor(ts / bucketSec) * bucketSec;
      const cur = buckets.get(bucket) ?? { p: 0, v: 0 };
      buckets.set(bucket, { p: price > 0 ? price : cur.p, v: cur.v + usd });
    }
  }

  if (low === Number.POSITIVE_INFINITY) low = 0;
  const priceChangePct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  const series = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, { p, v }]) => ({ t, p, v }));

  // Most-recent `limit` trades (descending).
  const recentRows = await prisma.trade.findMany({
    where,
    orderBy: { blockTime: 'desc' },
    take: safeLimit,
    select: {
      signature: true,
      side: true,
      amountInBaseUnits: true,
      priceUsd: true,
      blockTime: true,
      traderWallet: true,
    },
  });

  const recent = recentRows.map((tr) => {
    const amountBase = toBigInt(tr.amountInBaseUnits);
    const price = tr.priceUsd ?? 0;
    const amountWhole = Number(amountBase) / 10 ** (token.decimals ?? 9);
    return {
      signature: tr.signature ?? '',
      t: unixSeconds(tr.blockTime),
      side: (tr.side === 'BUY' ? 'buy' : 'sell') as 'buy' | 'sell',
      amountBase: amountBase.toString(),
      amountUsd: price > 0 ? amountWhole * price : 0,
      priceUsd: price,
      trader: tr.traderWallet ?? '',
    };
  });

  return {
    mint,
    range,
    summary: {
      priceUsd: lastPrice,
      priceChangePct,
      volumeUsd,
      volumeBase: volumeBase.toString(),
      buyCount,
      sellCount,
      uniqueTraders: traders.size,
      high,
      low,
    },
    series,
    recent,
  };
}

/**
 * Per-creator fee summary (CONTRACTS §e.4 / §b.11). A creator may own multiple
 * tokens (model supports it though `@@unique([userId, chain])` is 1 today).
 * `claimable` is owner/admin-only (route enforces).
 */
export async function getCreatorFeeSummary(
  creatorId: string,
  opts?: { includeClaimable?: boolean },
): Promise<{
  creatorId: string;
  lifetime: { volumeUsd: number; feesGeneratedUsd: number };
  perToken: Array<{ mint: string; symbol: string; feesGeneratedUsd: number }>;
  claimable?: { creatorUsd: number; momentoUsd: number };
}> {
  const tokens = await prisma.creatorToken.findMany({
    where: { userId: creatorId },
    select: { id: true, mintAddress: true, symbol: true },
  });

  const base = {
    creatorId,
    lifetime: { volumeUsd: 0, feesGeneratedUsd: 0 },
    perToken: [] as Array<{ mint: string; symbol: string; feesGeneratedUsd: number }>,
    ...(opts?.includeClaimable ? { claimable: { creatorUsd: 0, momentoUsd: 0 } } : {}),
  };

  if (tokens.length === 0) return base;

  const tokenIds = tokens.map((t) => t.id);

  // Lifetime volume (USD) from confirmed trades across all the creator's tokens.
  const trades = await prisma.trade.findMany({
    where: { tokenId: { in: tokenIds }, blockTime: { not: null } },
    select: { tokenId: true, amountInBaseUnits: true, priceUsd: true },
  });
  // We need decimals per token for the whole-token USD estimate.
  const decimalsByToken = new Map<string, number>();
  const fullTokens = await prisma.creatorToken.findMany({
    where: { id: { in: tokenIds } },
    select: { id: true, decimals: true },
  });
  for (const t of fullTokens) decimalsByToken.set(t.id, t.decimals ?? 9);

  let volumeUsd = 0;
  for (const tr of trades) {
    const price = tr.priceUsd ?? 0;
    if (price <= 0) continue;
    const dec = decimalsByToken.get(tr.tokenId) ?? 9;
    const amountWhole = Number(toBigInt(tr.amountInBaseUnits)) / 10 ** dec;
    volumeUsd += amountWhole * price;
  }

  // Fees generated + claimable from fee events.
  const feeEvents = await prisma.feeEvent.findMany({
    where: {
      tokenId: { in: tokenIds },
      recipient: { in: ['CREATOR', 'PLATFORM'] },
      type: { in: ['CREATOR_TRADING_FEE', 'PARTNER_TRADING_FEE', 'LOCKED_LP_FEE'] },
    },
    select: { tokenId: true, recipient: true, amountUsd: true, claimed: true },
  });

  const usdByToken = new Map<string, number>();
  let feesGeneratedUsd = 0;
  let creatorClaimableUsd = 0;
  let momentoClaimableUsd = 0;

  for (const ev of feeEvents) {
    const usd = ev.amountUsd ?? 0;
    feesGeneratedUsd += usd;
    usdByToken.set(ev.tokenId, (usdByToken.get(ev.tokenId) ?? 0) + usd);
    if (!ev.claimed) {
      if (ev.recipient === 'CREATOR') creatorClaimableUsd += usd;
      else if (ev.recipient === 'PLATFORM') momentoClaimableUsd += usd;
    }
  }

  const perToken = tokens.map((t) => ({
    mint: t.mintAddress ?? '',
    symbol: t.symbol,
    feesGeneratedUsd: usdByToken.get(t.id) ?? 0,
  }));

  const result = {
    creatorId,
    lifetime: { volumeUsd, feesGeneratedUsd },
    perToken,
    ...(opts?.includeClaimable
      ? { claimable: { creatorUsd: creatorClaimableUsd, momentoUsd: momentoClaimableUsd } }
      : {}),
  };

  return result;
}
