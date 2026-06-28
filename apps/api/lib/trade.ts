/**
 * apps/api/lib/trade.ts — P3-trade (CONTRACTS-P3A §b.2 / D-trade.md)
 * ============================================================================
 * In-app trading core: venue resolution, quote, build (intent), submit, token
 * detail.
 *
 * LOCKED decisions (D-trade §0):
 *  - Client-signed, backend self-submit for USER swaps. `POST /buy|/sell` builds
 *    the UNSIGNED Meteora swap tx (`buildUnsignedForClient`) and PERSISTS a Trade
 *    intent (`intentId` uuid, `source = IN_APP`, `signature = null`). `POST
 *    /buy|/sell/submit` relays the client-signed tx (`submitClientSigned`) and
 *    patches `{ signature, blockTime }` so the webhook classifies it IN_APP.
 *  - Venue selection is driven by `CreatorToken.status`: GRADUATED ⇒ DAMM v2
 *    (`cpAmm.swap` + pool-state-derived quote — cp-amm has NO getQuote, see
 *    REVIEW-sdk P1-3); ACTIVE ⇒ Meteora DBC bonding curve (`client.pool.swap` /
 *    `client.pool.swapQuote`). See `resolveTradeVenue`.
 *  - submit BINDS the client tx to the persisted intent (feePayer/pool/program)
 *    BEFORE broadcast and records the CONFIRMED on-chain fill (tx-meta deltas +
 *    real blockTime) AFTER confirm — never the pre-signature quote (SEC P0-1).
 *  - Rebate is COMPUTED + RECORDED here only (computeRebate → rebateToUsdc),
 *    rebateMint = USDC, rebatePaid = false. The USDC send is the fee-claim module.
 *
 * Money = base-unit STRINGS at every boundary; `bigint` in the math layer; USD =
 * number; bps = number; unix times = number (seconds) / ISO at the wire.
 *
 * IMPORT-SAFE: env / network / Connection access lives INSIDE functions only.
 * SDK signatures are taken VERBATIM from `scripts/spikes/spike-b-meteora-dbc.ts`.
 */

import { randomUUID } from 'crypto';
import BN from 'bn.js';
import { Connection, PublicKey, Transaction as TransactionImpl } from '@solana/web3.js';
import type { Transaction } from '@solana/web3.js';

// Meteora DBC (@meteora-ag/dynamic-bonding-curve-sdk@1.5.10) — top-level import
// is OK per CONTRACTS-P3A (dev-machine dep). Only the *use* is inside functions.
// DYNAMIC_BONDING_CURVE_PROGRAM_ID is an exported PublicKey (spike-b §line 126),
// used to assert a submitted swap tx invokes the DBC program (SEC P0-1).
import {
  DynamicBondingCurveClient,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
// Meteora DAMM v2 (@meteora-ag/cp-amm-sdk@1.4.3). `getTokenProgram(flag)` maps a
// pool's tokenAFlag/tokenBFlag (0=SPL, 1=Token-2022) to the program id (spike-b);
// CP_AMM_PROGRAM_ID is the exported cp-amm program PublicKey (spike-b §line 141).
import { CpAmm, getTokenProgram, CP_AMM_PROGRAM_ID } from '@meteora-ag/cp-amm-sdk';

import type { BuiltTx } from '@/lib/solana';
import {
  submitClientSigned,
  getConnection,
  clientRelaySigner,
  classify,
} from '@/lib/solana';
import { computeRebate, calcFee, rebateToUsdc } from '@/lib/fees';
import prisma from '@/lib/prisma';
import { MOMENTO_FEE, MOMENTO_TRADE, PoolType, TradeSide, getUsdcMint } from '@momento/shared';

// ════════════════════════════════════════════════════════════════════════════
//  Errors
// ════════════════════════════════════════════════════════════════════════════

export type TradeErrorCode =
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_NOT_TRADEABLE'
  | 'VENUE_UNRESOLVED'
  | 'QUOTE_STALE'
  | 'SLIPPAGE'
  | 'AMOUNT_INVALID'
  | 'WALLET_NOT_READY';

export class TradeError extends Error {
  readonly code: TradeErrorCode;
  constructor(code: TradeErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TradeError';
    this.code = code;
    Object.setPrototypeOf(this, TradeError.prototype);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Types (CONTRACTS-P3A §b.2)
// ════════════════════════════════════════════════════════════════════════════

export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2'; // narrowing of PoolType

export interface ResolvedToken {
  tokenId: string;
  mint: string;
  decimals: number;
  tokenProgram: 'TOKEN_2022' | 'TOKEN_CLASSIC';
  quoteMint: string;
  venue: TradeVenue;
  poolAddress: string;
  transferFeeBps: number;
  transferFeeMaxBaseUnits: bigint;
  rebateTargetBps: number;
  rebateMint: string;
}

export interface QuoteInput {
  token: ResolvedToken;
  side: TradeSide;
  amountInBaseUnits: bigint;
  slippageBps: number;
  priceUsd?: number;
}

export interface TradeQuote {
  venue: TradeVenue;
  inputMint: string;
  outputMint: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  priceUsd: number;
  priceTs: string;
  transferFeeBaseUnits: string;
  feeBps: number;
  rebateBaseUnits: string;
  rebateMint: string;
  effectiveFeeBps: number;
}

export interface BuildTradeInput {
  token: ResolvedToken;
  side: TradeSide;
  userId: string;
  traderWallet: string;
  amountInBaseUnits: bigint;
  slippageBps: number;
  quote: TradeQuote;
}

export interface BuiltTrade {
  intentId: string;
  tradeId: string;
  built: BuiltTx;
  quote: TradeQuote;
}

export interface SubmitTradeInput {
  intentId: string;
  txBase64: string;
  idempotencyKey: string;
}

export interface SubmitTradeResult {
  intentId: string;
  signature: string;
  venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING';
  deduped: boolean;
}

export interface TokenDetail {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  status: string;
  venue: TradeVenue;
  poolType: PoolType | null;
  poolAddress: string | null;
  priceUsd: number;
  marketCapUsd: number;
  transferFeeBps: number;
  feeConfig: {
    creatorBps: number;
    momentoBps: number;
    rebateTargetBps: number;
    rebateMint: string;
  };
  fundraise: {
    status: string;
    raisedBaseUnits: string;
    thresholdBaseUnits: string;
    progressPct: number;
    quoteMint: string;
  } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}

// ════════════════════════════════════════════════════════════════════════════
//  Small helpers
// ════════════════════════════════════════════════════════════════════════════

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

/** minOut = floor(expectedOut * (10_000 - slippageBps) / 10_000) in bigint (D-trade §5). */
function applySlippage(expectedOut: bigint, slippageBps: number): bigint {
  if (expectedOut <= BigInt(0)) return BigInt(0);
  const bps = BigInt(Math.max(0, Math.min(slippageBps, MOMENTO_TRADE.MAX_SLIPPAGE_BPS)));
  return (expectedOut * (BPS_DENOM - bps)) / BPS_DENOM;
}

/** A Connection for SDK reads. Network access stays inside the calling fn. */
function rpcConnection(): Connection {
  // Reuse the signer-layer cached Helius connection so SDK reads + submit share
  // the same endpoint/commitment.
  return getConnection();
}

/**
 * USD price for a mint via Helius DAS `getAsset` -> `token_info.price_info`
 * (D-trade §5). Display-only + rebate true-up snapshot; failures degrade to 0 so
 * a missing oracle never blocks a quote (rebateToUsdc treats price<=0 as 0).
 * TODO(verify-devnet): devnet DAS frequently returns no price_info; confirm the
 * field path against the deployed Helius response before relying on it live.
 */
async function fetchDasPriceUsd(mint: string): Promise<number> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return 0;
  const network = process.env.SOLANA_NETWORK || 'devnet';
  const rpcHost =
    network === 'mainnet-beta' ? 'mainnet.helius-rpc.com' : 'devnet.helius-rpc.com';
  const rpcUrl = `https://${rpcHost}/?api-key=${apiKey}`;
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'momento-trade-price',
        method: 'getAsset',
        params: { id: mint },
      }),
    });
    const data = await res.json();
    const price = data?.result?.token_info?.price_info?.price_per_token;
    return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Venue resolution (D-trade §2)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a mint to its trade venue + fee config. Reads CreatorToken (+ feeConfig
 * + fundraise quoteMint). Single source of truth = `CreatorToken.status`:
 *   GRADUATED (or a DAMM v2 pool address recorded) ⇒ METEORA_DAMM_V2
 *   ACTIVE with dbcPoolAddress                       ⇒ METEORA_DBC
 *   else                                              ⇒ TradeError('TOKEN_NOT_TRADEABLE')
 */
export async function resolveTradeVenue(mint: string): Promise<ResolvedToken> {
  const token = await prisma.creatorToken.findUnique({
    where: { mintAddress: mint },
    include: { feeConfig: true, fundraise: true },
  });
  if (!token) throw new TradeError('TOKEN_NOT_FOUND', 'Token not found');

  // Cluster-scoped USDC mint, resolved at request time (devnet vs mainnet).
  const usdcMint = getUsdcMint();
  const decimals = token.decimals ?? MOMENTO_FEE.USDC_DECIMALS;
  const tokenProgram = (token.tokenProgram ?? 'TOKEN_2022') as 'TOKEN_2022' | 'TOKEN_CLASSIC';
  const quoteMint = token.quoteMint ?? token.fundraise?.quoteMint ?? usdcMint;

  const transferFeeBps =
    token.feeConfig?.transferFeeBps ??
    token.transferFeeBps ??
    MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;
  const transferFeeMaxBaseUnits = toBigInt(token.transferFeeMaxBaseUnits);
  const rebateTargetBps = token.feeConfig?.rebateTargetBps ?? MOMENTO_FEE.TARGET_IN_APP_BPS;
  // Rebate is ALWAYS the fee-exempt mint (USDC), NEVER the creator token.
  const rebateMint = token.feeConfig?.rebateMint ?? usdcMint;

  // ── DAMM v2 (post-graduation) ──
  const graduated =
    token.status === 'GRADUATED' ||
    (token.poolType === 'METEORA_DAMM_V2' && !!token.poolAddress);
  if (graduated) {
    // Prefer the explicit DAMM v2 pool address recorded by graduation; fall back
    // to an LpPosition row (graduation persists two). Discovery via
    // cpAmm.getPositionsByUser/derive is the last resort (D-trade §10.4).
    let poolAddress = token.poolType === 'METEORA_DAMM_V2' ? token.poolAddress ?? '' : '';
    if (!poolAddress) {
      const lp = await prisma.lpPosition.findFirst({
        where: { tokenId: token.id, provider: 'METEORA_DAMM_V2' },
        select: { poolAddress: true },
      });
      poolAddress = lp?.poolAddress ?? '';
    }
    if (!poolAddress) {
      throw new TradeError('VENUE_UNRESOLVED', 'Graduated token has no DAMM v2 pool address');
    }
    return {
      tokenId: token.id,
      mint,
      decimals,
      tokenProgram,
      quoteMint,
      venue: 'METEORA_DAMM_V2',
      poolAddress,
      transferFeeBps,
      transferFeeMaxBaseUnits,
      rebateTargetBps,
      rebateMint,
    };
  }

  // ── DBC bonding curve (pre-graduation) ──
  if (token.status === 'ACTIVE' && token.dbcPoolAddress) {
    return {
      tokenId: token.id,
      mint,
      decimals,
      tokenProgram,
      quoteMint,
      venue: 'METEORA_DBC',
      poolAddress: token.dbcPoolAddress,
      transferFeeBps,
      transferFeeMaxBaseUnits,
      rebateTargetBps,
      rebateMint,
    };
  }

  throw new TradeError(
    'TOKEN_NOT_TRADEABLE',
    `Token is not tradeable (status=${token.status})`,
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Quote (D-trade §5)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Direction helpers. BUY  = quote(USDC) → base(token) ⇒ swapBaseForQuote=false.
 *                    SELL = base(token) → quote(USDC) ⇒ swapBaseForQuote=true.
 */
function isBuy(side: TradeSide): boolean {
  return side === 'BUY';
}

function inputOutputMints(token: ResolvedToken, side: TradeSide): {
  inputMint: string;
  outputMint: string;
} {
  return isBuy(side)
    ? { inputMint: token.quoteMint, outputMint: token.mint }
    : { inputMint: token.mint, outputMint: token.quoteMint };
}

/**
 * Read `expectedOut` from the live curve/pool. Returns the expected output in
 * base units (bigint).
 *
 *   DBC      client.pool.swapQuote(...)            (spike-b §line 102, sync helper)
 *   DAMM v2  derive from fetchPoolState reserves   (cp-amm 1.4.3 has NO getQuote;
 *            the verified surface is fetchPoolState only — REVIEW-sdk P1-3)
 *
 * TODO(verify-devnet): the exact `swapQuote` param/result shape (DBC) and the
 * cp-amm `PoolState` reserve/fee field names (DAMM v2) are minor-version
 * sensitive. Re-verify against the installed SDK `.d.ts` before relying on this
 * live; the DAMM v2 branch is an offline constant-product estimate, not an SDK
 * quote.
 */
async function fetchExpectedOut(input: QuoteInput): Promise<bigint> {
  const { token, side, amountInBaseUnits, slippageBps } = input;
  const conn = rpcConnection();
  const amountIn = new BN(amountInBaseUnits.toString());
  const swapBaseForQuote = !isBuy(side); // BUY=false, SELL=true (spike-b)

  if (token.venue === 'METEORA_DBC') {
    const client = DynamicBondingCurveClient.create(conn, 'confirmed');
    // spike-b: client.pool.swapQuote(params) is the sync quote helper.
    // TODO(verify-devnet): exact param keys (pool/poolState, amountIn, slippageBps,
    // swapBaseForQuote) re-verify against installed .d.ts.
    const quote: any = await (client.pool as any).swapQuote({
      pool: new PublicKey(token.poolAddress),
      amountIn,
      slippageBps,
      swapBaseForQuote,
      referralTokenAccount: null,
    });
    return extractAmountOut(quote);
  }

  // DAMM v2 (REVIEW-sdk P1-3): `cpAmm.getQuote` does NOT exist in the verified
  // cp-amm 1.4.3 surface (spike-b lists fetchPoolState but no quote method). We
  // compute the expected out from pool-state reserves with the constant-product
  // formula (xy=k) minus the pool fee, instead of calling a non-existent method.
  const cpAmm = new CpAmm(conn);
  const poolState: any = await (cpAmm as any).fetchPoolState(new PublicKey(token.poolAddress));
  return computeDammV2ExpectedOut(poolState, token, side, amountInBaseUnits);
}

/**
 * Offline constant-product (xy=k) estimate of a DAMM v2 swap output from pool
 * reserves. cp-amm v2 is a CLMM, so this is an APPROXIMATION (true output depends
 * on active-bin liquidity); the trader's real protection is the on-chain
 * `minimumAmountOut` baked into the swap ix (slippage guard), not this estimate.
 *
 * out = floor( (amountIn * (10_000 - feeBps) / 10_000) * reserveOut
 *              / (reserveIn + amountIn * (10_000 - feeBps) / 10_000) )
 *
 * TODO(verify-devnet): confirm the cp-amm `PoolState` field names for token A/B
 * reserves + the pool fee bps against the installed `.d.ts`. The keys below are
 * read defensively with several common aliases; if none resolve we return 0 so
 * getTradeQuote raises SLIPPAGE rather than quoting a fabricated number.
 */
function computeDammV2ExpectedOut(
  poolState: any,
  token: ResolvedToken,
  side: TradeSide,
  amountInBaseUnits: bigint,
): bigint {
  if (poolState == null || amountInBaseUnits <= BigInt(0)) return BigInt(0);

  const readBig = (...candidates: any[]): bigint => {
    for (const c of candidates) {
      if (c == null) continue;
      try {
        if (typeof c === 'bigint') return c;
        if (typeof c?.toString === 'function' && typeof c !== 'string') {
          const b = toBigInt(c.toString());
          if (b > BigInt(0)) return b;
        }
        const b = toBigInt(c);
        if (b > BigInt(0)) return b;
      } catch {
        /* try next alias */
      }
    }
    return BigInt(0);
  };

  // Token A is the base (creator token), token B is the quote (USDC) — but we do
  // NOT assume the ordering; map by which mint matches the creator token.
  const tokenAMint =
    poolState.tokenAMint?.toBase58?.() ?? String(poolState.tokenAMint ?? '');
  const baseIsA = tokenAMint === token.mint;

  const reserveA = readBig(
    poolState.tokenAReserve,
    poolState.tokenAAmount,
    poolState.reserveA,
    poolState.baseReserve,
    poolState.tokenAVaultAmount,
  );
  const reserveB = readBig(
    poolState.tokenBReserve,
    poolState.tokenBAmount,
    poolState.reserveB,
    poolState.quoteReserve,
    poolState.tokenBVaultAmount,
  );
  if (reserveA <= BigInt(0) || reserveB <= BigInt(0)) return BigInt(0);

  const baseReserve = baseIsA ? reserveA : reserveB;
  const quoteReserve = baseIsA ? reserveB : reserveA;

  // BUY: in=quote(USDC) out=base(token); SELL: in=base out=quote.
  const reserveIn = isBuy(side) ? quoteReserve : baseReserve;
  const reserveOut = isBuy(side) ? baseReserve : quoteReserve;

  // Pool fee bps (best-effort field names). Default to the DBC base fee tier.
  const feeBpsBig = readBig(
    poolState.poolFeeBps,
    poolState.tradeFeeBps,
    poolState.baseFeeBps,
    poolState.poolFee?.baseFeeBps,
  );
  const feeBps = feeBpsBig > BigInt(0) && feeBpsBig < BPS_DENOM ? feeBpsBig : BigInt(0);

  const amountInAfterFee = (amountInBaseUnits * (BPS_DENOM - feeBps)) / BPS_DENOM;
  if (amountInAfterFee <= BigInt(0)) return BigInt(0);

  // out = amountInAfterFee * reserveOut / (reserveIn + amountInAfterFee)
  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  if (denominator <= BigInt(0)) return BigInt(0);
  const out = numerator / denominator;
  return out > BigInt(0) ? out : BigInt(0);
}

/** Best-effort extraction of an output amount (base units) from an SDK quote. */
function extractAmountOut(quote: any): bigint {
  if (quote == null) return BigInt(0);
  const candidate =
    quote.amountOut ??
    quote.outputAmount ??
    quote.outAmount ??
    quote.swapOutAmount ??
    quote.minSwapOutAmount ??
    quote.expectedOutputAmount ??
    quote;
  // BN -> string -> bigint; number/string handled by toBigInt.
  if (candidate && typeof candidate.toString === 'function' && typeof candidate !== 'string') {
    try {
      return toBigInt(candidate.toString());
    } catch {
      /* fall through */
    }
  }
  return toBigInt(candidate);
}

/**
 * Build a swap quote from live curve/pool state. Computes minOut from slippage
 * and the owed rebate from fees.ts. Pure read — no DB writes, no tx build.
 *
 * The transfer-fee disclosure is computed on the BASE-token leg (the Token-2022
 * transfer fee only applies to the creator-token transfer): BUY → the token
 * OUTPUT is taxed; SELL → the token INPUT is taxed (D-trade §1 fee disclosure).
 */
export async function getTradeQuote(input: QuoteInput): Promise<TradeQuote> {
  const { token, side, amountInBaseUnits, slippageBps } = input;
  if (amountInBaseUnits <= BigInt(0)) {
    throw new TradeError('AMOUNT_INVALID', 'amountIn must be > 0');
  }

  const { inputMint, outputMint } = inputOutputMints(token, side);

  let expectedOut: bigint;
  try {
    expectedOut = await fetchExpectedOut(input);
  } catch (err) {
    // Wrap SDK/RPC errors so the route maps them consistently.
    throw classify(err);
  }
  if (expectedOut <= BigInt(0)) {
    throw new TradeError('SLIPPAGE', 'Quote returned a non-positive output amount');
  }
  const minOut = applySlippage(expectedOut, slippageBps);

  // Transfer-fee disclosure on the taxed creator-token leg.
  const taxedBaseGross = isBuy(side) ? expectedOut : amountInBaseUnits;
  const chargedFee = calcFee(taxedBaseGross, token.transferFeeBps, token.transferFeeMaxBaseUnits);
  const { rebateOwedNet } = computeRebate({
    grossBaseUnits: taxedBaseGross,
    feeBps: token.transferFeeBps,
    targetBps: token.rebateTargetBps,
    maxFeeBaseUnits: token.transferFeeMaxBaseUnits,
  });

  // USD price (display + rebate true-up snapshot). For the creator-token price.
  const priceUsd = input.priceUsd ?? (await fetchDasPriceUsd(token.mint));
  const priceTs = new Date().toISOString();

  // Default rebate path = USDC (fee-exempt, no gross-up). Convert the
  // token-denominated net rebate to USDC base units using the token→USDC price.
  const rebateBaseUnits = rebateToUsdc(rebateOwedNet, priceUsd, token.decimals);

  return {
    venue: token.venue,
    inputMint,
    outputMint,
    amountInBaseUnits: amountInBaseUnits.toString(),
    expectedOutBaseUnits: expectedOut.toString(),
    minOutBaseUnits: minOut.toString(),
    priceUsd,
    priceTs,
    transferFeeBaseUnits: chargedFee.toString(),
    feeBps: token.transferFeeBps,
    rebateBaseUnits: rebateBaseUnits.toString(),
    rebateMint: token.rebateMint,
    effectiveFeeBps: token.rebateTargetBps,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Build (unsigned + persisted intent) (D-trade §1, §4, §8)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build the venue swap Transaction with owner=traderWallet, amountIn, and
 * minimumAmountOut=minOut. SDK signatures VERBATIM from spike-b:
 *   DBC      client.pool.swap({ owner, pool, amountIn, minimumAmountOut,
 *                               swapBaseForQuote, referralTokenAccount:null, payer })
 *   DAMM v2  cpAmm.swap({ ... })  (cp-amm 1.4.3)
 */
async function buildSwapTransaction(input: BuildTradeInput): Promise<Transaction> {
  const { token, side, traderWallet, amountInBaseUnits, quote } = input;
  const conn = rpcConnection();
  const owner = new PublicKey(traderWallet);
  const pool = new PublicKey(token.poolAddress);
  const amountIn = new BN(amountInBaseUnits.toString());
  const minimumAmountOut = new BN(quote.minOutBaseUnits);
  const swapBaseForQuote = !isBuy(side);

  if (token.venue === 'METEORA_DBC') {
    const client = DynamicBondingCurveClient.create(conn, 'confirmed');
    // spike-b §line 484: client.pool.swap returns a web3.js Transaction.
    return (await client.pool.swap({
      owner,
      pool,
      amountIn,
      minimumAmountOut,
      swapBaseForQuote,
      referralTokenAccount: null,
      payer: owner,
    } as any)) as Transaction;
  }

  // DAMM v2 — cpAmm.swap. cp-amm 1.4.3's `SwapParams` is NOT in the verified
  // spike-b surface (only fetchPoolState/claimPositionFee/lock/position readers
  // were verified). REVIEW-sdk P1-2: the real SwapParams almost certainly needs
  // the token vault + program fields, like the verified `claimPositionFee`. We
  // therefore derive those from poolState (the proven pattern) and pass them.
  // TODO(verify-devnet): confirm the exact cp-amm 1.4.3 `SwapParams` keys against
  // the installed `.d.ts` — the vault/mint/program fields below mirror the
  // verified claimPositionFee shape but `swap` was never exercised in spike-b.
  const cpAmm = new CpAmm(conn);
  const poolState: any = await (cpAmm as any).fetchPoolState(pool);
  const inputTokenMint = new PublicKey(isBuy(side) ? token.quoteMint : token.mint);
  const outputTokenMint = new PublicKey(isBuy(side) ? token.mint : token.quoteMint);
  return (await (cpAmm as any).swap({
    owner,
    payer: owner,
    pool,
    poolState,
    inputTokenMint,
    outputTokenMint,
    amountIn,
    minimumAmountOut,
    // verified-shape fields from claimPositionFee (spike-b L629-641): vaults +
    // mints + per-leg token programs resolved from the pool's flags.
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    referralTokenAccount: null,
  })) as Transaction;
}

/**
 * Build the UNSIGNED Meteora swap tx and PERSIST the Trade intent.
 *   1. Re-validate venue + re-quote server-side (never trust the client quote);
 *      if the freshly resolved venue differs from the quoted venue ⇒ QUOTE_STALE.
 *   2. Build the venue swap ix (owner=traderWallet, amountIn, minOut).
 *   3. Wrap as BuiltTx { tx, signers:[clientRelaySigner(trader)], label, CU } —
 *      feePayer/blockhash are filled by buildUnsignedForClient at the route.
 *   4. Persist Trade { intentId uuid, source:IN_APP, signature:null, blockTime:null,
 *      rebateBaseUnits (USDC), rebateMint, rebatePaid:false, … }.
 *
 * Returns the BuiltTx (the route calls buildUnsignedForClient on `built`).
 */
export async function buildTrade(input: BuildTradeInput): Promise<BuiltTrade> {
  const { token, side, userId, traderWallet, amountInBaseUnits, slippageBps } = input;
  if (amountInBaseUnits <= BigInt(0)) {
    throw new TradeError('AMOUNT_INVALID', 'amountIn must be > 0');
  }

  // (1) Re-resolve venue from current state. A token that graduated between the
  //     client's quote and this build flips venue → force a re-quote.
  const fresh = await resolveTradeVenue(token.mint);
  if (fresh.venue !== input.quote.venue) {
    throw new TradeError('QUOTE_STALE', 'Venue changed since quote; re-quote required');
  }

  // (2) Re-quote server-side (authoritative minOut/rebate snapshot).
  const quote = await getTradeQuote({
    token: fresh,
    side,
    amountInBaseUnits,
    slippageBps,
  });

  // (2b) QUOTE_STALE on PRICE drift, not just venue change (REVIEW-correctness
  //      P1-2 / D-trade §5). If the fresh expectedOut/minOut moved adversely
  //      beyond a tolerance from the quote the client was SHOWN, reject so the
  //      client re-quotes at the new price instead of silently rebuilding at a
  //      worse minOut. Tolerance = the trade's slippageBps + a fixed cushion,
  //      both clamped; only ADVERSE drift (fresh < client) trips it — a more
  //      favourable price is fine to build at.
  const clientExpectedOut = toBigInt(input.quote.expectedOutBaseUnits);
  const freshExpectedOut = toBigInt(quote.expectedOutBaseUnits);
  if (clientExpectedOut > BigInt(0) && freshExpectedOut < clientExpectedOut) {
    const toleranceBps = BigInt(
      Math.max(
        0,
        Math.min(
          slippageBps + MOMENTO_TRADE.DEFAULT_SLIPPAGE_BPS,
          MOMENTO_TRADE.MAX_SLIPPAGE_BPS,
        ),
      ),
    );
    // Adverse drift in bps = (clientExpectedOut - freshExpectedOut) / clientExpectedOut.
    const driftBps = ((clientExpectedOut - freshExpectedOut) * BPS_DENOM) / clientExpectedOut;
    if (driftBps > toleranceBps) {
      throw new TradeError(
        'QUOTE_STALE',
        `Quote moved ${driftBps.toString()}bps adversely since shown (tolerance ${toleranceBps.toString()}bps); re-quote required`,
      );
    }
  }

  const { inputMint, outputMint } = inputOutputMints(fresh, side);

  // (3) Build the venue swap tx.
  let tx: Transaction;
  try {
    tx = await buildSwapTransaction({ ...input, token: fresh, quote });
  } catch (err) {
    throw classify(err);
  }

  const built: BuiltTx = {
    tx,
    signers: [clientRelaySigner(new PublicKey(traderWallet))],
    computeUnitLimit: MOMENTO_TRADE.DEFAULT_COMPUTE_UNIT_LIMIT,
    label: isBuy(side) ? 'trade.buy' : 'trade.sell',
  };

  // (4) Persist the IN_APP intent BEFORE any signature exists (D-trade §4).
  //     Prisma generates `intentId`/`id` via @default(uuid()); we read them back.
  const trade = await prisma.trade.create({
    data: {
      tokenId: fresh.tokenId,
      userId,
      traderWallet,
      side: side as TradeSide,
      source: 'IN_APP',
      venue: fresh.venue as PoolType,
      intentId: randomUUID(),
      signature: null,
      amountInBaseUnits: quote.amountInBaseUnits,
      amountInMint: inputMint,
      amountOutBaseUnits: quote.expectedOutBaseUnits,
      amountOutMint: outputMint,
      priceUsd: quote.priceUsd > 0 ? quote.priceUsd : null,
      priceTs: new Date(quote.priceTs),
      transferFeeBaseUnits: quote.transferFeeBaseUnits,
      feeBps: quote.feeBps,
      rebateBaseUnits: quote.rebateBaseUnits,
      rebateMint: quote.rebateMint,
      rebatePaid: false,
      poolAddress: fresh.poolAddress,
      blockTime: null,
    },
    select: { id: true, intentId: true },
  });

  return {
    intentId: trade.intentId!,
    tradeId: trade.id,
    built,
    quote,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Submit (relay step 2) (D-trade §1, §4)
// ════════════════════════════════════════════════════════════════════════════

/**
 * SEC P0-1 (build↔submit binding): deserialize the client-submitted tx and assert
 * it corresponds to the PERSISTED intent BEFORE we broadcast. A user must not be
 * able to swap a different/larger amount, a different mint, or a different pool
 * than the recorded intent (the rebate basis is derived from that intent), nor
 * pay from a wallet other than their own.
 *
 * Validated offline (no SDK decode required):
 *   - feePayer / owner == the intent's `traderWallet`;
 *   - the intent's `poolAddress` appears among the tx's account keys (the swap
 *     targets the SAME pool);
 *   - the venue swap PROGRAM (DBC or cp-amm) appears among the tx's program ids.
 *
 * Throws TradeError('AMOUNT_INVALID') (route → 4xx) on any mismatch.
 *
 * SWAP IX-DATA BINDING (P1 hardening): both the DBC and cp-amm swap instructions
 * are Anchor instructions whose data is `[8-byte discriminator][amountIn: u64 LE]
 * [minimumAmountOut: u64 LE]` (Anchor convention; the SDK-built tx we authored at
 * /buy|/sell uses exactly this layout). We locate the swap ix (the one invoking
 * the resolved venue program AND touching the intent pool), decode its trailing
 * two u64s, and assert:
 *   - decoded amountIn  == intent.amountInBaseUnits  (EXACT — the recorded rebate
 *     / raise basis is derived from this amount; a different amountIn would let a
 *     trader game the rebate basis vs the quote);
 *   - decoded minOut    is within [1, expectedOut]   (the server slippage guard:
 *     minOut must be positive — never a no-slippage minOut=0 — and can never
 *     exceed the quoted expected output).
 * The decode is best-effort defensive: if no swap ix carries a ≥24-byte data tail
 * (8 discriminator + two u64s) the assertion is skipped (binding falls back to
 * feePayer+pool+program), so a future SDK layout change degrades safely rather
 * than rejecting valid swaps.
 */
function readU64LE(buf: Buffer, offset: number): bigint {
  let v = BigInt(0);
  for (let i = 0; i < 8; i++) {
    v |= BigInt(buf[offset + i] ?? 0) << BigInt(8 * i);
  }
  return v;
}

function assertTxMatchesIntent(
  txBase64: string,
  intent: {
    traderWallet: string;
    poolAddress: string | null;
    venue: TradeVenue;
    amountInBaseUnits: bigint;
    expectedOutBaseUnits: bigint;
  },
): void {
  let tx: Transaction;
  try {
    tx = TransactionImpl.from(Buffer.from(txBase64, 'base64'));
  } catch {
    throw new TradeError('AMOUNT_INVALID', 'Submitted transaction could not be decoded');
  }

  // feePayer / owner must be the intent's trader wallet.
  const feePayer = tx.feePayer?.toBase58();
  if (!feePayer || feePayer !== intent.traderWallet) {
    throw new TradeError(
      'AMOUNT_INVALID',
      'Submitted transaction fee payer does not match the trade intent owner',
    );
  }

  // Collect every account key + program id referenced by the tx.
  const accountKeys = new Set<string>();
  const programIds = new Set<string>();
  for (const ix of tx.instructions) {
    if (ix.programId) programIds.add(ix.programId.toBase58());
    for (const k of ix.keys) accountKeys.add(k.pubkey.toBase58());
  }

  // The intent's pool MUST be one of the accounts the swap touches.
  if (!intent.poolAddress || !accountKeys.has(intent.poolAddress)) {
    throw new TradeError(
      'AMOUNT_INVALID',
      'Submitted transaction does not target the trade intent pool',
    );
  }

  // The venue swap program MUST be present (rejects a non-swap / wrong-venue tx).
  const expectedProgram =
    intent.venue === 'METEORA_DBC'
      ? DYNAMIC_BONDING_CURVE_PROGRAM_ID
      : CP_AMM_PROGRAM_ID;
  if (!expectedProgram || !programIds.has(expectedProgram.toBase58())) {
    throw new TradeError(
      'AMOUNT_INVALID',
      'Submitted transaction does not invoke the expected swap program',
    );
  }
  const expectedProgramId = expectedProgram.toBase58();

  // ── SWAP IX-DATA BINDING: decode amountIn / minOut from the swap instruction ──
  // The swap ix is the one invoking the venue program AND touching the intent pool.
  let decoded: { amountIn: bigint; minOut: bigint } | null = null;
  for (const ix of tx.instructions) {
    if (!ix.programId || ix.programId.toBase58() !== expectedProgramId) continue;
    const touchesPool = ix.keys.some((k) => k.pubkey.toBase58() === intent.poolAddress);
    if (!touchesPool) continue;
    const data = ix.data instanceof Buffer ? ix.data : Buffer.from(ix.data ?? []);
    // Anchor swap ix: [8-byte discriminator][u64 amountIn][u64 minimumAmountOut].
    // Both the DBC and cp-amm `swap` instructions take exactly (amountIn,
    // minimumAmountOut) as data args (the referral account is an *account*, not an
    // ix-data field), so amountIn is at offset 8 and minOut at offset 16.
    if (data.length >= 24) {
      const amountIn = readU64LE(data, 8);
      const minOut = readU64LE(data, 16);
      decoded = { amountIn, minOut };
      break;
    }
  }

  if (decoded) {
    // amountIn must EXACTLY match the recorded intent (rebate/raise basis).
    if (decoded.amountIn !== intent.amountInBaseUnits) {
      throw new TradeError(
        'AMOUNT_INVALID',
        'Submitted swap amount does not match the trade intent',
      );
    }
    // minOut must be positive (real slippage guard) and never exceed the quoted
    // expected output. A minOut=0 swap forfeits slippage protection; a minOut >
    // expectedOut is not a swap we ever quoted.
    if (decoded.minOut <= BigInt(0)) {
      throw new TradeError(
        'SLIPPAGE',
        'Submitted swap has no slippage protection (minimumAmountOut=0)',
      );
    }
    if (intent.expectedOutBaseUnits > BigInt(0) && decoded.minOut > intent.expectedOutBaseUnits) {
      throw new TradeError(
        'SLIPPAGE',
        'Submitted swap minimumAmountOut exceeds the quoted expected output',
      );
    }
  }
}

/**
 * SEC P0-1 / correctness P1-3 (confirmed fill): read the ACTUAL fill from the
 * CONFIRMED tx meta (pre/post token-balance deltas for the trader), so the row
 * records what really landed — NOT the pre-signature quote. The fee-claim rebate
 * sweep re-derives the rebate from this confirmed fill.
 *
 * Returns the trader's signed deltas:
 *   amountInBaseUnits  = |negative delta on the inputMint owned by trader|
 *   amountOutBaseUnits = positive delta on the outputMint owned by trader
 * plus the real on-chain `blockTime` (unix seconds). Any field that cannot be
 * resolved is returned null so the caller can fall back without fabricating.
 *
 * Mirrors fee-claim.ts `claimedAmountFromMeta` (post-pre token-balance delta).
 */
async function deriveConfirmedFill(
  signature: string,
  traderWallet: string,
  inputMint: string,
  outputMint: string,
): Promise<{
  amountInBaseUnits: bigint | null;
  amountOutBaseUnits: bigint | null;
  blockTime: Date | null;
}> {
  let tx: any;
  try {
    // Read at 'confirmed' to align with submitClientSigned's confirmation
    // commitment — the default 'finalized' would transiently return null right
    // after a confirmed-level land and falsely degrade us to PENDING.
    tx = await getConnection().getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch {
    return { amountInBaseUnits: null, amountOutBaseUnits: null, blockTime: null };
  }
  if (!tx || tx.meta == null || tx.meta.err != null) {
    return { amountInBaseUnits: null, amountOutBaseUnits: null, blockTime: null };
  }

  const pre: any[] = Array.isArray(tx.meta.preTokenBalances) ? tx.meta.preTokenBalances : [];
  const post: any[] = Array.isArray(tx.meta.postTokenBalances) ? tx.meta.postTokenBalances : [];

  const rawOf = (b: any): bigint => {
    try {
      return BigInt(b?.uiTokenAmount?.amount ?? '0');
    } catch {
      return BigInt(0);
    }
  };
  // Sum the signed delta for (owner==trader, mint==target) across the trader's
  // ATAs for that mint (a swap may route through one ATA per leg).
  const deltaFor = (mint: string): bigint => {
    const preByIdx = new Map<number, any>();
    for (const b of pre) {
      if (b?.owner === traderWallet && b?.mint === mint && typeof b?.accountIndex === 'number') {
        preByIdx.set(b.accountIndex, b);
      }
    }
    let delta = BigInt(0);
    const seen = new Set<number>();
    for (const b of post) {
      if (b?.owner !== traderWallet || b?.mint !== mint) continue;
      if (typeof b?.accountIndex !== 'number') continue;
      seen.add(b.accountIndex);
      delta += rawOf(b) - rawOf(preByIdx.get(b.accountIndex));
    }
    // Account closed/absent post but present pre (e.g. fully spent leg).
    for (const [idx, b] of preByIdx) {
      if (!seen.has(idx)) delta -= rawOf(b);
    }
    return delta;
  };

  const inDelta = deltaFor(inputMint); // expected negative (spent)
  const outDelta = deltaFor(outputMint); // expected positive (received)

  const amountInBaseUnits = inDelta < BigInt(0) ? -inDelta : null;
  const amountOutBaseUnits = outDelta > BigInt(0) ? outDelta : null;
  const blockTime =
    typeof tx.blockTime === 'number' && Number.isFinite(tx.blockTime)
      ? new Date(tx.blockTime * 1000)
      : null;

  return { amountInBaseUnits, amountOutBaseUnits, blockTime };
}

/**
 * Self-submit the client-signed tx (submitClientSigned, route forced 'rpc') then,
 * ONLY after it actually confirms, patch the Trade with the CONFIRMED fill so the
 * webhook classifies it IN_APP and the rebate cron re-derives the rebate from the
 * real on-chain fill.
 *
 *   1. ownership + intent integrity checks;
 *   2. SEC P0-1: assert the client tx matches the persisted intent BEFORE relay;
 *   3. relay (submitClientSigned only RETURNS on confirm — it throws on TIMEOUT);
 *   4. SEC P0-1 / P1-3: parse the confirmed tx meta and persist the ACTUAL
 *      amountIn/amountOut + signature + REAL blockTime (never a fabricated one).
 *
 * Auth: a missing intent → TradeError('TOKEN_NOT_FOUND') (route → 404); a
 * non-owner → TradeError('WALLET_NOT_READY') (route → 403, D-trade §6).
 *
 * Idempotent: a re-submit of an intent that already carries a signature returns
 * it with `deduped:true` (Trade.signature @unique + the solana idempotency store).
 */
export async function submitTrade(
  input: SubmitTradeInput & { userId: string; mint?: string },
): Promise<SubmitTradeResult> {
  const { intentId, txBase64, idempotencyKey, userId, mint } = input;

  const trade = await prisma.trade.findUnique({
    where: { intentId },
    select: {
      id: true,
      userId: true,
      venue: true,
      signature: true,
      blockTime: true,
      traderWallet: true,
      poolAddress: true,
      amountInBaseUnits: true,
      amountOutBaseUnits: true,
      amountInMint: true,
      amountOutMint: true,
      token: { select: { mintAddress: true } },
    },
  });
  if (!trade) throw new TradeError('TOKEN_NOT_FOUND', 'Trade intent not found');
  // Ownership: only the intent's user may submit it.
  if (trade.userId !== userId) {
    throw new TradeError('WALLET_NOT_READY', 'Trade intent does not belong to this user');
  }
  // REVIEW-security P1-9: the [mint] path param MUST match the intent's token, so
  // an intent for token A cannot be POSTed to /tokens/<mintB>/submit.
  if (mint && trade.token?.mintAddress && trade.token.mintAddress !== mint) {
    throw new TradeError('TOKEN_NOT_FOUND', 'Trade intent does not match this token');
  }

  const venue = trade.venue as TradeVenue;

  // Idempotency at the DB: if the signature is already recorded, return it.
  // CONFIRMED only when a real (on-chain) blockTime is present.
  if (trade.signature) {
    return {
      intentId,
      signature: trade.signature,
      venue,
      status: trade.blockTime ? 'CONFIRMED' : 'PENDING',
      deduped: true,
    };
  }

  // (2) SEC P0-1: bind the submitted tx to the recorded intent BEFORE broadcast.
  assertTxMatchesIntent(txBase64, {
    traderWallet: trade.traderWallet,
    poolAddress: trade.poolAddress,
    venue,
    amountInBaseUnits: toBigInt(trade.amountInBaseUnits),
    expectedOutBaseUnits: toBigInt(trade.amountOutBaseUnits),
  });

  // (3) Relay. submitClientSigned RETURNS only on a real confirm (or a dedup
  //     short-circuit from the durable idempotency store); it THROWS on TIMEOUT/
  //     BLOCKHASH_EXPIRED/on-chain failure. So a returned result == confirmed.
  let result;
  try {
    result = await submitClientSigned({ txBase64, idempotencyKey });
  } catch (err) {
    throw classify(err);
  }

  // (4) SEC P0-1 / P1-3: derive the CONFIRMED fill from the confirmed tx meta and
  //     persist the ACTUAL amounts + signature + REAL blockTime. Never fabricate
  //     blockTime — if the meta read fails, leave blockTime null (PENDING) so the
  //     authoritative webhook sets it and the rebate sweep waits for a real fill.
  const fill = await deriveConfirmedFill(
    result.signature,
    trade.traderWallet,
    trade.amountInMint,
    trade.amountOutMint,
  );

  const data: {
    signature: string;
    blockTime?: Date | null;
    amountInBaseUnits?: string;
    amountOutBaseUnits?: string;
  } = { signature: result.signature };
  if (fill.blockTime) data.blockTime = fill.blockTime;
  if (fill.amountInBaseUnits != null) data.amountInBaseUnits = fill.amountInBaseUnits.toString();
  if (fill.amountOutBaseUnits != null) data.amountOutBaseUnits = fill.amountOutBaseUnits.toString();

  try {
    await prisma.trade.update({
      where: { id: trade.id },
      data,
    });
  } catch (err) {
    // A concurrent webhook/submit may have already attached this signature
    // (unique-constraint race). The signature is what matters; surface it.
    if (!result.signature) throw err;
  }

  // CONFIRMED only when we actually have a real on-chain blockTime; otherwise the
  // tx is on-chain but our confirmed-fill read did not resolve → PENDING (the
  // webhook will finalize blockTime + the rebate sweep will not run until then).
  const status: SubmitTradeResult['status'] = fill.blockTime ? 'CONFIRMED' : 'PENDING';

  return {
    intentId,
    signature: result.signature,
    venue,
    status,
    deduped: result.deduped,
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Token detail (D-trade §3.1)
// ════════════════════════════════════════════════════════════════════════════

/** Clamp a percentage into [0, 100]. */
function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * GET /api/tokens/[mint] read model: price + fundraise progress + fee config +
 * venue. Returns null when the token does not exist (route maps → 404).
 */
export async function getTokenDetail(mint: string): Promise<TokenDetail | null> {
  const token = await prisma.creatorToken.findUnique({
    where: { mintAddress: mint },
    include: {
      feeConfig: true,
      fundraise: true,
      creator: {
        select: { id: true, username: true, isAdminApproved: true },
      },
    },
  });
  if (!token) return null;

  // Cluster-scoped USDC mint, resolved at request time (devnet vs mainnet).
  const usdcMint = getUsdcMint();
  const decimals = token.decimals ?? MOMENTO_FEE.USDC_DECIMALS;
  const quoteMint = token.quoteMint ?? token.fundraise?.quoteMint ?? usdcMint;

  // Venue: GRADUATED ⇒ DAMM v2; else (ACTIVE/other) ⇒ DBC curve. Detail is a
  // read model (no throw) — it just reports the current venue.
  const graduated =
    token.status === 'GRADUATED' ||
    (token.poolType === 'METEORA_DAMM_V2' && !!token.poolAddress);
  const venue: TradeVenue = graduated ? 'METEORA_DAMM_V2' : 'METEORA_DBC';

  const poolType = (token.poolType as PoolType | null) ?? null;
  const poolAddress = graduated
    ? token.poolAddress ?? null
    : token.dbcPoolAddress ?? token.poolAddress ?? null;

  const transferFeeBps =
    token.feeConfig?.transferFeeBps ??
    token.transferFeeBps ??
    MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;

  // Effective fee disclosure: 80% LP leg split by trading-fee bps (mirrors
  // lib/fees.ts getTokenFeeSummary.split). These are the share of the WHOLE fee.
  const creatorTradingFeeBps =
    token.feeConfig?.creatorTradingFeeBps ?? MOMENTO_FEE.DEFAULT_CREATOR_TRADING_FEE_BPS;
  const partnerTradingFeeBps =
    token.feeConfig?.partnerTradingFeeBps ?? MOMENTO_FEE.DEFAULT_PARTNER_TRADING_FEE_BPS;
  const lpShareBps = 10_000 - MOMENTO_FEE.PROTOCOL_FEE_BPS;
  const feeConfig = {
    creatorBps: Math.round(lpShareBps * (creatorTradingFeeBps / 10_000)),
    momentoBps: Math.round(lpShareBps * (partnerTradingFeeBps / 10_000)),
    rebateTargetBps: token.feeConfig?.rebateTargetBps ?? MOMENTO_FEE.TARGET_IN_APP_BPS,
    rebateMint: token.feeConfig?.rebateMint ?? usdcMint,
  };

  // USD price + market cap (display). totalSupply is a whole-token base-unit
  // string; marketCap = circulatingSupply(whole) * price.
  const priceUsd = await fetchDasPriceUsd(mint);
  const circulatingWhole = Number(toBigInt(token.circulatingSupply)) / 10 ** decimals;
  const marketCapUsd = priceUsd > 0 ? circulatingWhole * priceUsd : 0;

  // Fundraise progress (pre-graduation only).
  let fundraise: TokenDetail['fundraise'] = null;
  if (!graduated && token.fundraise) {
    const raised = toBigInt(token.fundraise.raisedBaseUnits);
    const threshold = toBigInt(token.fundraise.thresholdBaseUnits);
    const progressPct =
      threshold > BigInt(0)
        ? clampPct((Number(raised) / Number(threshold)) * 100)
        : 0;
    fundraise = {
      status: token.fundraise.status,
      raisedBaseUnits: raised.toString(),
      thresholdBaseUnits: threshold.toString(),
      progressPct,
      quoteMint: token.fundraise.quoteMint ?? quoteMint,
    };
  }

  return {
    mint,
    name: token.name,
    symbol: token.symbol,
    imageUrl: token.imageUrl ?? null,
    decimals,
    totalSupply: token.totalSupply,
    circulatingSupply: token.circulatingSupply,
    status: token.status,
    venue,
    poolType,
    poolAddress,
    priceUsd,
    marketCapUsd,
    transferFeeBps,
    feeConfig,
    fundraise,
    creator: {
      id: token.creator?.id ?? token.userId,
      username: token.creator?.username ?? null,
      verified: token.creator?.isAdminApproved ?? false,
    },
    graduatedAt: token.graduatedAt ? Math.floor(token.graduatedAt.getTime() / 1000) : null,
  };
}
