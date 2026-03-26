/**
 * Jupiter Swap API V1 integration.
 *
 * Uses the /build path approach for platform fees — Momento keeps 100%
 * of the fee (no Jupiter revenue share). The fee is taken from the output
 * token and sent to MOMENTO_FEE_WALLET's associated token account.
 *
 * Future: when creator tokens launch, this same infrastructure handles
 * trading creator tokens with the platform fee flowing to Momento.
 */

const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';

/** Well-known Solana token mints */
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

function getJupiterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  const apiKey = process.env.JUPITER_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

function getPlatformFeeBps(): number {
  return parseInt(process.env.MOMENTO_PLATFORM_FEE_BPS || '400', 10);
}

function getFeeWallet(): string | null {
  return process.env.MOMENTO_FEE_WALLET || null;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: any[];
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  // The full quote response to pass to /swap
  raw: any;
}

/**
 * Get a swap quote from Jupiter with platform fee included.
 */
export async function getSwapQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}): Promise<SwapQuote> {
  const { inputMint, outputMint, amount, slippageBps = 50 } = params;
  const platformFeeBps = getPlatformFeeBps();

  const queryParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
  });

  // Only add platform fee when a fee wallet is configured
  if (getFeeWallet()) {
    queryParams.set('platformFeeBps', platformFeeBps.toString());
  }

  const response = await fetch(
    `${JUPITER_API_BASE}/quote?${queryParams.toString()}`,
    { headers: getJupiterHeaders() }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[Jupiter] Quote error:', response.status, errorBody);
    // Parse Jupiter error for user-friendly message
    let detail = '';
    try { detail = JSON.parse(errorBody)?.error || errorBody; } catch { detail = errorBody; }
    throw new Error(detail || `Jupiter quote failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    otherAmountThreshold: data.otherAmountThreshold,
    priceImpactPct: data.priceImpactPct,
    routePlan: data.routePlan || [],
    platformFee: data.platformFee,
    raw: data,
  };
}

/**
 * Build a swap transaction from a quote.
 *
 * Returns a base64-encoded serialized transaction that the client
 * deserializes, signs with Privy's embedded wallet, and sends.
 */
export async function buildSwapTransaction(params: {
  quoteResponse: any;
  userPublicKey: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const { quoteResponse, userPublicKey } = params;
  const feeWallet = getFeeWallet();

  const body: Record<string, any> = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  };

  // Add fee account if configured
  if (feeWallet) {
    body.feeAccount = feeWallet;
  }

  const response = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: 'POST',
    headers: {
      ...getJupiterHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Jupiter] Swap build error:', response.status, error);
    throw new Error(`Jupiter swap build failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    swapTransaction: data.swapTransaction,
    lastValidBlockHeight: data.lastValidBlockHeight,
  };
}
