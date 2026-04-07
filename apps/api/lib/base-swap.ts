/**
 * KyberSwap Aggregator integration for Base chain.
 *
 * Replaces the dead 0x Swap API v1 (sunset 2025-04-11). KyberSwap is free,
 * does not require an API key, supports Base mainnet (chainId 8453), and
 * returns ready-to-sign transaction data via a two-step flow:
 *
 *   1. GET  /base/api/v1/routes       -> routeSummary (the "quote")
 *   2. POST /base/api/v1/route/build  -> {data, routerAddress, transactionValue}
 *
 * The optional `X-Client-Id` header is forwarded for friendlier rate limits.
 *
 * Docs: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification/evm-swaps
 *
 * Parallel to lib/jupiter.ts (Solana). Note that unlike 0x v1, KyberSwap does
 * NOT bundle the transaction payload into the quote — the build call is
 * required separately. We surface this to the route handler by carrying the
 * `routeSummary` object inside SwapQuote.raw and rebuilding on POST.
 */
import type { SwapQuote } from '@momento/shared';
import { CHAIN_CONFIG } from '@momento/shared';

const DEFAULT_KYBER_BASE_URL = 'https://aggregator-api.kyberswap.com';
const KYBER_BASE_PATH = 'base'; // chain identifier in the URL path
const BASE_CHAIN_ID = 8453 as const;

/** EVM-wide sentinel for the native token (ETH on Base). */
const NATIVE_TOKEN_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function getKyberBaseUrl(): string {
  return process.env.BASE_AGGREGATOR_URL || DEFAULT_KYBER_BASE_URL;
}

function getClientId(): string {
  // Used as KyberSwap's `X-Client-Id` header. Optional but recommended; presence
  // grants a friendlier rate limit. Defaults to the project name.
  return process.env.KYBER_CLIENT_ID || 'momento';
}

function getKyberHeaders(): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Client-Id': getClientId(),
  };
}

function getPlatformFeeBps(): number {
  return parseInt(process.env.MOMENTO_PLATFORM_FEE_BPS || '400', 10);
}

function getBaseFeeWallet(): string | null {
  return process.env.BASE_FEE_WALLET || null;
}

function normalizeAddress(addr: string): string {
  return (addr || '').toLowerCase();
}

function isNativeToken(addr: string): boolean {
  if (!addr) return false;
  const lower = addr.toLowerCase();
  return (
    lower === NATIVE_TOKEN_SENTINEL.toLowerCase() ||
    lower === 'eth' ||
    lower === 'native'
  );
}

/** Translate friendly aliases ('ETH', 'native') to the EVM sentinel. */
function resolveTokenAddress(token: string): string {
  if (isNativeToken(token)) return NATIVE_TOKEN_SENTINEL;
  return token;
}

/** Well-known Base token addresses (for callers / tests). */
export const BASE_TOKEN_ADDRESSES = {
  ETH: NATIVE_TOKEN_SENTINEL,
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: CHAIN_CONFIG.base.usdcAddress,
} as const;

/**
 * Subset of the Kyberswap routeSummary we care about. The full object is
 * round-tripped to /route/build verbatim and also stored in SwapQuote.raw
 * so the mobile client can inspect it.
 */
export interface KyberRouteSummary {
  tokenIn: string;
  amountIn: string;
  amountInUsd?: string;
  tokenOut: string;
  amountOut: string;
  amountOutUsd?: string;
  gas?: string;
  gasPrice?: string;
  gasUsd?: string;
  route: unknown;
  routeID?: string;
  checksum?: string;
  timestamp?: number;
  extraFee?: {
    feeAmount?: string;
    chargeFeeBy?: string;
    isInBps?: boolean;
    feeReceiver?: string;
  };
}

/**
 * What we stash in SwapQuote.raw so POST /api/wallet/swap has everything
 * it needs to call /route/build. We also embed `taker` so the POST handler
 * can cross-check that the quote was fetched for the same wallet that's
 * now asking to build the transaction (HIGH security fix).
 */
export interface BaseSwapQuoteRaw {
  aggregator: 'kyberswap';
  chainId: typeof BASE_CHAIN_ID;
  routeSummary: KyberRouteSummary;
  taker: string; // lowercase
  slippageBps: number;
  sellToken: string; // lowercase, normalized (sentinel for native)
  buyToken: string; // lowercase, normalized
}

/**
 * Get a swap quote from KyberSwap on Base chain.
 * Equivalent to getSwapQuote() in jupiter.ts.
 *
 * `takerAddress` is REQUIRED — the build step needs a sender, and we want
 * the quote and the build to be tied to the same wallet end-to-end.
 */
export async function getBaseSwapQuote(params: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippageBps?: number;
  takerAddress?: string;
}): Promise<SwapQuote> {
  const { sellToken, buyToken, sellAmount, slippageBps = 50, takerAddress } = params;

  if (!sellToken || !buyToken || !sellAmount) {
    throw new Error('sellToken, buyToken, and sellAmount are required');
  }
  if (!takerAddress) {
    throw new Error('takerAddress is required for Base swaps (Kyberswap needs a sender)');
  }

  const tokenIn = resolveTokenAddress(sellToken);
  const tokenOut = resolveTokenAddress(buyToken);

  const queryParams = new URLSearchParams({
    tokenIn,
    tokenOut,
    amountIn: sellAmount,
    gasInclude: 'true',
  });

  // KyberSwap supports a referral/platform fee taken from the input or output
  // token. We charge on `currency_out` (the token the user is buying) so the
  // fee is denominated in the destination asset. Skip silently if no fee
  // wallet is configured.
  const feeWallet = getBaseFeeWallet();
  const platformFeeBps = getPlatformFeeBps();
  if (feeWallet && platformFeeBps > 0) {
    queryParams.set('chargeFeeBy', 'currency_out');
    queryParams.set('feeAmount', String(platformFeeBps));
    queryParams.set('isInBps', 'true');
    queryParams.set('feeReceiver', feeWallet);
  }

  const url = `${getKyberBaseUrl()}/${KYBER_BASE_PATH}/api/v1/routes?${queryParams.toString()}`;

  const response = await fetch(url, { headers: getKyberHeaders() });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[KyberSwap] Quote error:', response.status, errorBody);
    let detail = '';
    try {
      const parsed = JSON.parse(errorBody);
      detail = parsed?.message || parsed?.details || parsed?.error || errorBody;
    } catch {
      detail = errorBody;
    }
    throw new Error(detail || `KyberSwap quote failed: ${response.status}`);
  }

  const json: any = await response.json();
  // KyberSwap envelope: { code, message, data: { routeSummary, routerAddress } }
  const routeSummary: KyberRouteSummary | undefined = json?.data?.routeSummary;
  if (!routeSummary || !routeSummary.amountOut) {
    console.error('[KyberSwap] Unexpected quote response shape:', json);
    throw new Error('KyberSwap returned no route for this pair');
  }

  const raw: BaseSwapQuoteRaw = {
    aggregator: 'kyberswap',
    chainId: BASE_CHAIN_ID,
    routeSummary,
    taker: normalizeAddress(takerAddress),
    slippageBps,
    sellToken: normalizeAddress(tokenIn),
    buyToken: normalizeAddress(tokenOut),
  };

  return {
    chain: 'base',
    inputMint: tokenIn,
    outputMint: tokenOut,
    inAmount: routeSummary.amountIn,
    outAmount: routeSummary.amountOut,
    // KyberSwap enforces slippage at /route/build time, not in the quote.
    // We surface amountOut as the threshold; the actual minOut is computed
    // by the router contract using the slippageTolerance passed at build.
    otherAmountThreshold: routeSummary.amountOut,
    priceImpactPct: '0',
    platformFee: feeWallet && platformFeeBps > 0
      ? { amount: '0', feeBps: platformFeeBps }
      : undefined,
    raw,
  };
}

/**
 * Build a swap transaction for Base chain by calling KyberSwap's
 * /route/build endpoint with the routeSummary from the quote step.
 *
 * Returns transaction fields ready for the mobile client to sign with
 * the user's embedded EVM wallet.
 *
 * SECURITY: validates that the quote was originally fetched for
 * `userPublicKey` (we stamped the taker into raw.taker in getBaseSwapQuote).
 * If the caller passes a quote that was fetched for a different wallet,
 * we reject — this prevents a session-confusion attack where one user's
 * quote is built for another user's wallet.
 */
export async function buildBaseSwapTransaction(params: {
  quoteResponse: any;
  userPublicKey: string;
}): Promise<{
  chain: 'base';
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  chainId: typeof BASE_CHAIN_ID;
  from: string;
  allowanceTarget?: string;
  sellTokenAddress: string;
  requiresApproval: boolean;
}> {
  const { quoteResponse, userPublicKey } = params;

  if (!quoteResponse) {
    throw new Error('quoteResponse is required');
  }
  if (!userPublicKey) {
    throw new Error('userPublicKey is required');
  }

  // The quoteResponse may be either:
  //   (a) the full SwapQuote we returned from getBaseSwapQuote (with .raw), or
  //   (b) a bare BaseSwapQuoteRaw (the .raw subobject).
  const raw: BaseSwapQuoteRaw =
    quoteResponse?.raw && typeof quoteResponse.raw === 'object'
      ? quoteResponse.raw
      : quoteResponse;

  if (!raw || raw.aggregator !== 'kyberswap' || !raw.routeSummary) {
    throw new Error('Invalid quoteResponse: expected KyberSwap routeSummary');
  }

  // ---- HIGH security cross-check: quote taker MUST match session wallet ----
  const expectedTaker = normalizeAddress(userPublicKey);
  const quoteTaker = normalizeAddress(raw.taker);
  if (!quoteTaker || quoteTaker !== expectedTaker) {
    console.warn(
      '[KyberSwap] Taker mismatch on build:',
      'quoteTaker=', quoteTaker,
      'sessionWallet=', expectedTaker,
    );
    throw new Error('Quote was fetched for a different wallet; please refresh the quote.');
  }

  const buildBody = {
    routeSummary: raw.routeSummary,
    sender: userPublicKey,
    recipient: userPublicKey,
    slippageTolerance: raw.slippageBps ?? 50,
    source: getClientId(),
    enableGasEstimation: true,
  };

  const url = `${getKyberBaseUrl()}/${KYBER_BASE_PATH}/api/v1/route/build`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getKyberHeaders(),
    body: JSON.stringify(buildBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[KyberSwap] Build error:', response.status, errorBody);
    let detail = '';
    try {
      const parsed = JSON.parse(errorBody);
      detail = parsed?.message || parsed?.details || parsed?.error || errorBody;
    } catch {
      detail = errorBody;
    }
    throw new Error(detail || `KyberSwap build failed: ${response.status}`);
  }

  const json: any = await response.json();
  const buildData = json?.data;
  if (!buildData || !buildData.data || !buildData.routerAddress) {
    console.error('[KyberSwap] Unexpected build response shape:', json);
    throw new Error('KyberSwap build returned no transaction data');
  }

  // KyberSwap returns `transactionValue` as a decimal string for native swaps.
  // We coerce to hex (with 0x prefix) so the mobile EVM signer gets the
  // standard format. Empty / "0" -> "0x0".
  const valueStr: string = buildData.transactionValue ?? '0';
  let valueHex = '0x0';
  try {
    const asBig = BigInt(valueStr);
    valueHex = '0x' + asBig.toString(16);
  } catch {
    // Some responses may already be 0x-prefixed; pass through if so.
    valueHex = typeof valueStr === 'string' && valueStr.startsWith('0x')
      ? valueStr
      : '0x0';
  }

  const sellTokenAddress = raw.routeSummary.tokenIn;
  const isNative = isNativeToken(sellTokenAddress);

  // For ERC-20 sells, the user must approve the router (the routerAddress
  // returned by /route/build) to pull `amountIn`. The mobile client should
  // check current allowance and issue approve(routerAddress, amountIn) first
  // if needed. KyberSwap does NOT use Permit2 by default in this flow.
  return {
    chain: 'base',
    to: buildData.routerAddress,
    data: buildData.data,
    value: valueHex,
    gas: buildData.gas ? String(buildData.gas) : raw.routeSummary.gas,
    gasPrice: raw.routeSummary.gasPrice,
    chainId: BASE_CHAIN_ID,
    from: userPublicKey,
    allowanceTarget: isNative ? undefined : buildData.routerAddress,
    sellTokenAddress,
    requiresApproval: !isNative,
  };
}
