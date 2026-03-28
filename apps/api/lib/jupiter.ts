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
import { PublicKey } from '@solana/web3.js';

// Use lite-api (free, no API key required). Upgrade to api.jup.ag with API key for higher limits.
const JUPITER_API_BASE = process.env.JUPITER_API_KEY
  ? 'https://api.jup.ag/swap/v1'
  : 'https://lite-api.jup.ag/swap/v1';

/** Well-known Solana program IDs for ATA derivation */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

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
  skipPlatformFee?: boolean;
}): Promise<SwapQuote> {
  const { inputMint, outputMint, amount, slippageBps = 50, skipPlatformFee = false } = params;
  const platformFeeBps = getPlatformFeeBps();

  const queryParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
  });

  // Only add platform fee when a fee wallet is configured and not skipped
  if (getFeeWallet() && !skipPlatformFee) {
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
/**
 * Derive the Associated Token Account (ATA) for a given wallet + mint.
 * Jupiter requires the ATA (not the wallet address) as the feeAccount.
 *
 * Uses on-chain PDA derivation — works for ANY token automatically.
 * No hardcoded lookup needed; new tokens are supported instantly.
 *
 * NOTE: Native SOL (the wrapped SOL mint) can technically have an ATA,
 * but Jupiter handles wSOL wrapping/unwrapping internally when
 * `wrapAndUnwrapSol: true`. For SOL-output swaps, the fee would need
 * a pre-funded wSOL ATA, which is impractical. We return '' for SOL
 * so the caller falls back to a feeless quote.
 */
function deriveATA(walletAddress: string, mintAddress: string): string {
  try {
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(mintAddress);
    const [ata] = PublicKey.findProgramAddressSync(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return ata.toBase58();
  } catch (err) {
    console.warn('[Jupiter] Failed to derive ATA:', err);
    return '';
  }
}

export async function buildSwapTransaction(params: {
  quoteResponse: any;
  userPublicKey: string;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const { quoteResponse, userPublicKey } = params;
  const feeWallet = getFeeWallet();
  const hasPlatformFee = !!quoteResponse.platformFee;

  const body: Record<string, any> = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol: true,
  };

  // Derive the ATA for the output token and add as feeAccount.
  // Jupiter requires feeAccount when the quote includes platformFee.
  // If we can't resolve the ATA (e.g. SOL output has no standard ATA,
  // or the ATA doesn't exist on-chain), we must re-quote without fee.
  let needsFeelessRetry = false;

  if (feeWallet && hasPlatformFee) {
    const outputMint = quoteResponse.outputMint;
    const ata = deriveATA(feeWallet, outputMint);
    if (ata) {
      body.feeAccount = ata;
    } else {
      // Can't derive ATA (e.g. output is native SOL) — must re-quote without fee
      console.warn('[Jupiter] No ATA for fee wallet + output mint:', outputMint, '— will re-quote without platform fee');
      needsFeelessRetry = true;
    }
  }

  // If we already know we can't provide a feeAccount, skip the doomed request
  // and go straight to a feeless quote
  if (needsFeelessRetry) {
    const freshQuote = await getSwapQuote({
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      amount: quoteResponse.inAmount,
      slippageBps: quoteResponse.slippageBps || 50,
      skipPlatformFee: true,
    });
    body.quoteResponse = freshQuote.raw;
    delete body.feeAccount;
  }

  let response = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: 'POST',
    headers: {
      ...getJupiterHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // If the fee account exists but the request still fails (e.g. ATA not
  // funded on-chain), retry with a feeless quote
  if (!response.ok && body.feeAccount) {
    const errorText = await response.text();
    console.warn('[Jupiter] Swap with fee failed, retrying without fee:', errorText);
    delete body.feeAccount;
    const freshQuote = await getSwapQuote({
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      amount: quoteResponse.inAmount,
      slippageBps: quoteResponse.slippageBps || 50,
      skipPlatformFee: true,
    });
    body.quoteResponse = freshQuote.raw;
    response = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: 'POST',
      headers: {
        ...getJupiterHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    const error = await response.text();
    console.error('[Jupiter] Swap build error:', response.status, error);
    let detail = '';
    try { detail = JSON.parse(error)?.error || error; } catch { detail = error; }
    throw new Error(detail || `Jupiter swap build failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    swapTransaction: data.swapTransaction,
    lastValidBlockHeight: data.lastValidBlockHeight,
  };
}
