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
 *    (`cpAmm.swap` / `cpAmm.getQuote`); ACTIVE ⇒ Meteora DBC bonding curve
 *    (`client.pool.swap` / `client.pool.swapQuote`). See `resolveTradeVenue`.
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
import { Connection, PublicKey } from '@solana/web3.js';
import type { Transaction } from '@solana/web3.js';

// Meteora DBC (@meteora-ag/dynamic-bonding-curve-sdk@1.5.10) — top-level import
// is OK per CONTRACTS-P3A (dev-machine dep). Only the *use* is inside functions.
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
// Meteora DAMM v2 (@meteora-ag/cp-amm-sdk@1.4.3)
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

import type { BuiltTx } from '@/lib/solana';
import {
  submitClientSigned,
  getConnection,
  clientRelaySigner,
  classify,
} from '@/lib/solana';
import { computeRebate, calcFee, rebateToUsdc } from '@/lib/fees';
import prisma from '@/lib/prisma';
import { MOMENTO_FEE, MOMENTO_TRADE, PoolType, TradeSide } from '@momento/shared';

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

  const decimals = token.decimals ?? MOMENTO_FEE.USDC_DECIMALS;
  const tokenProgram = (token.tokenProgram ?? 'TOKEN_2022') as 'TOKEN_2022' | 'TOKEN_CLASSIC';
  const quoteMint = token.quoteMint ?? token.fundraise?.quoteMint ?? MOMENTO_FEE.USDC_MINT;

  const transferFeeBps =
    token.feeConfig?.transferFeeBps ??
    token.transferFeeBps ??
    MOMENTO_FEE.DEFAULT_TRANSFER_FEE_BPS;
  const transferFeeMaxBaseUnits = toBigInt(token.transferFeeMaxBaseUnits);
  const rebateTargetBps = token.feeConfig?.rebateTargetBps ?? MOMENTO_FEE.TARGET_IN_APP_BPS;
  // Rebate is ALWAYS the fee-exempt mint (USDC), NEVER the creator token.
  const rebateMint = token.feeConfig?.rebateMint ?? MOMENTO_FEE.USDC_MINT;

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
 * Read `expectedOut` from the live curve/pool via the Meteora SDK sync helper:
 *   DBC      client.pool.swapQuote(...)   (spike-b §line 102)
 *   DAMM v2  cpAmm.getQuote(...)          (spike-b SDK surface)
 * Returns the expected output in base units (bigint).
 *
 * TODO(verify-devnet): the exact `swapQuote`/`getQuote` param + result shapes are
 * minor-version sensitive (spike-b flags these). We read the conventional
 * `amountOut`/`minSwapOutAmount`/`outputAmount` field and fall back to a BN-like
 * shape. Re-verify against the installed SDK `.d.ts` before relying on this live.
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

  // DAMM v2
  const cpAmm = new CpAmm(conn);
  // TODO(verify-devnet): cp-amm 1.4.3 getQuote param/result shape.
  const poolState: any = await (cpAmm as any).fetchPoolState(new PublicKey(token.poolAddress));
  const quote: any = await (cpAmm as any).getQuote({
    pool: new PublicKey(token.poolAddress),
    poolState,
    inAmount: amountIn,
    amountIn,
    slippage: slippageBps,
    slippageBps,
    // BUY: input is the quote (USDC); SELL: input is the base (token).
    inputTokenMint: new PublicKey(isBuy(side) ? token.quoteMint : token.mint),
  });
  return extractAmountOut(quote);
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

  // DAMM v2 — cpAmm.swap. TODO(verify-devnet): cp-amm 1.4.3 swap param shape.
  const cpAmm = new CpAmm(conn);
  const poolState: any = await (cpAmm as any).fetchPoolState(pool);
  return (await (cpAmm as any).swap({
    owner,
    payer: owner,
    pool,
    poolState,
    inputTokenMint: new PublicKey(isBuy(side) ? token.quoteMint : token.mint),
    outputTokenMint: new PublicKey(isBuy(side) ? token.mint : token.quoteMint),
    amountIn,
    minimumAmountOut,
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
 * Self-submit the client-signed tx (submitClientSigned, route forced 'rpc'),
 * then patch the Trade { signature, blockTime } so the webhook classifies it
 * IN_APP and the rebate cron pays it.
 *
 * Auth: ownership is enforced here (the intent MUST belong to `userId`). A
 * missing intent throws TradeError('TOKEN_NOT_FOUND') (route → 404); a non-owner
 * throws TradeError('WALLET_NOT_READY') which the submit route maps to 403
 * (D-trade §6).
 *
 * Idempotent: a re-submit of the same intent whose Trade already carries a
 * signature returns that signature with `deduped:true` (Trade.signature @unique +
 * the solana idempotency store both guard re-broadcast).
 */
export async function submitTrade(
  input: SubmitTradeInput & { userId: string },
): Promise<SubmitTradeResult> {
  const { intentId, txBase64, idempotencyKey, userId } = input;

  const trade = await prisma.trade.findUnique({
    where: { intentId },
    select: {
      id: true,
      userId: true,
      venue: true,
      signature: true,
      blockTime: true,
    },
  });
  if (!trade) throw new TradeError('TOKEN_NOT_FOUND', 'Trade intent not found');
  // Ownership: only the intent's user may submit it.
  if (trade.userId !== userId) {
    throw new TradeError('WALLET_NOT_READY', 'Trade intent does not belong to this user');
  }

  const venue = trade.venue as TradeVenue;

  // Idempotency at the DB: if the signature is already recorded, return it.
  if (trade.signature) {
    return {
      intentId,
      signature: trade.signature,
      venue,
      status: trade.blockTime ? 'CONFIRMED' : 'PENDING',
      deduped: true,
    };
  }

  // Relay: route forced to 'rpc' inside submitClientSigned (client tx, no tip).
  let result;
  try {
    result = await submitClientSigned({ txBase64, idempotencyKey });
  } catch (err) {
    throw classify(err);
  }

  // Patch the SAME row so the webhook joins on `signature` and classifies IN_APP.
  // Trade.signature @unique guards against two intents racing the same sig.
  const blockTime = new Date();
  try {
    await prisma.trade.update({
      where: { id: trade.id },
      data: { signature: result.signature, blockTime },
    });
  } catch (err) {
    // A concurrent webhook/submit may have already attached this signature
    // (unique-constraint race). The signature is what matters; surface it.
    if (!result.signature) throw err;
  }

  return {
    intentId,
    signature: result.signature,
    venue,
    status: 'CONFIRMED',
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

  const decimals = token.decimals ?? MOMENTO_FEE.USDC_DECIMALS;
  const quoteMint = token.quoteMint ?? token.fundraise?.quoteMint ?? MOMENTO_FEE.USDC_MINT;

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
    rebateMint: token.feeConfig?.rebateMint ?? MOMENTO_FEE.USDC_MINT,
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
