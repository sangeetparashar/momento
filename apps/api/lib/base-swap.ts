/**
 * 0x Swap API integration for Base chain.
 *
 * Parallel to lib/jupiter.ts (Solana). For EVM chains, the 0x API
 * returns the full transaction payload (`to`, `data`, `value`, `gas`)
 * inside the quote response — there is no separate "build" step.
 *
 * Works on the free tier WITHOUT an API key. If ZEROX_API_KEY is set
 * in env, it is forwarded as the `0x-api-key` header (paid tier).
 */
import type { SwapQuote } from '@momento/shared';
import { CHAIN_CONFIG } from '@momento/shared';

const BASE_ZEROX_URL = 'https://base.api.0x.org';
const BASE_CHAIN_ID = 8453;

function getZeroXHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  const apiKey = process.env.ZEROX_API_KEY;
  if (apiKey) {
    headers['0x-api-key'] = apiKey;
  }
  return headers;
}

function getPlatformFeeBps(): number {
  return parseInt(process.env.MOMENTO_PLATFORM_FEE_BPS || '400', 10);
}

function getBaseFeeWallet(): string | null {
  return process.env.BASE_FEE_WALLET || null;
}

/** Well-known Base token addresses */
export const BASE_TOKEN_ADDRESSES = {
  // 0x native ETH placeholder address (EVM convention)
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: CHAIN_CONFIG.base.usdcAddress,
} as const;

/**
 * Raw 0x quote response shape (subset of fields we use).
 * The full object is also stored in SwapQuote.raw for the client.
 */
export interface ZeroXQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  price: string;
  estimatedPriceImpact?: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
  buyTokenAddress: string;
  sellTokenAddress: string;
  allowanceTarget: string;
}

/**
 * Get a swap quote from 0x API on Base chain.
 * Equivalent to getSwapQuote() in jupiter.ts.
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

  // 0x uses a fractional slippage (e.g. 0.005 = 0.5%)
  const slippagePercentage = (slippageBps / 10000).toString();

  const queryParams = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount,
    slippagePercentage,
  });

  if (takerAddress) {
    queryParams.set('takerAddress', takerAddress);
  }

  // Add platform fee if configured
  const feeWallet = getBaseFeeWallet();
  const platformFeeBps = getPlatformFeeBps();
  if (feeWallet && platformFeeBps > 0) {
    queryParams.set('buyTokenPercentageFee', (platformFeeBps / 10000).toString());
    queryParams.set('feeRecipient', feeWallet);
  }

  const response = await fetch(
    `${BASE_ZEROX_URL}/swap/v1/quote?${queryParams.toString()}`,
    { headers: getZeroXHeaders() }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[0x] Quote error:', response.status, errorBody);
    let detail = '';
    try {
      const parsed = JSON.parse(errorBody);
      detail = parsed?.reason || parsed?.message || parsed?.validationErrors?.[0]?.reason || errorBody;
    } catch {
      detail = errorBody;
    }
    throw new Error(detail || `0x quote failed: ${response.status}`);
  }

  const data: ZeroXQuoteResponse = await response.json();

  return {
    chain: 'base',
    inputMint: sellToken,
    outputMint: buyToken,
    inAmount: data.sellAmount,
    outAmount: data.buyAmount,
    // 0x bakes slippage into the swap call itself; the buyAmount is the
    // expected output and slippage is enforced on-chain.
    otherAmountThreshold: data.buyAmount,
    priceImpactPct: data.estimatedPriceImpact || '0',
    platformFee: feeWallet && platformFeeBps > 0
      ? { amount: '0', feeBps: platformFeeBps }
      : undefined,
    raw: data,
  };
}

/**
 * Build a swap transaction for Base chain.
 *
 * Unlike Solana (where the server constructs a VersionedTransaction),
 * the 0x quote response IS the transaction payload — the mobile client
 * just needs to forward it to the EVM wallet provider for signing.
 *
 * We also flag whether an ERC-20 approval is required (any non-native
 * sell token) and surface the `allowanceTarget` so the client can
 * issue the approve() call before the swap.
 */
export async function buildBaseSwapTransaction(params: {
  quoteResponse: ZeroXQuoteResponse;
  userAddress: string;
}): Promise<{
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
  chainId: number;
  from: string;
  allowanceTarget: string;
  sellTokenAddress: string;
  requiresApproval: boolean;
}> {
  const { quoteResponse, userAddress } = params;

  if (!quoteResponse || !quoteResponse.to || !quoteResponse.data) {
    throw new Error('Invalid 0x quoteResponse: missing transaction fields');
  }

  const sellTokenAddress = quoteResponse.sellTokenAddress;
  const isNativeEth =
    !!sellTokenAddress &&
    sellTokenAddress.toLowerCase() === BASE_TOKEN_ADDRESSES.ETH.toLowerCase();

  return {
    to: quoteResponse.to,
    data: quoteResponse.data,
    value: quoteResponse.value,
    gas: quoteResponse.gas,
    gasPrice: quoteResponse.gasPrice,
    chainId: BASE_CHAIN_ID,
    from: userAddress,
    allowanceTarget: quoteResponse.allowanceTarget,
    sellTokenAddress,
    requiresApproval: !isNativeEth,
  };
}
