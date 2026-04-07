import type { TokenHolding, WalletBalance } from '@momento/shared';
import { getOrSetCache } from './redis';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

/**
 * Convert a raw integer balance (bigint) to a human-readable Number with the
 * given decimals.
 *
 * Precision boundary: results are exact for balances whose WHOLE-unit portion
 * fits in JS's safe integer range — i.e. < 2^53 ≈ 9.007e15 whole units. For
 * ETH (18 decimals) that means amounts under ~9 quadrillion ETH are exact;
 * the float64 mantissa starts losing fractional precision well before that
 * but is more than enough for any realistic wallet balance. Above the safe
 * range we extract the whole-unit portion via BigInt division (lossless) and
 * add the fractional part as a Number, which still keeps ~15 significant
 * figures of precision.
 */
function formatUnits(wei: bigint, decimals: number): number {
  if (wei === BigInt(0)) return 0;
  const divisor = BigInt(10) ** BigInt(decimals);

  if (wei < BigInt(Number.MAX_SAFE_INTEGER)) {
    // Fast path: full bigint fits in a safe Number, single division is exact
    return Number(wei) / Number(divisor);
  }

  // Slow path: split into whole + fractional to avoid overflow
  const whole = wei / divisor;
  const remainder = wei % divisor;
  return Number(whole) + Number(remainder) / Number(divisor);
}

// Well-known Base chain tokens to check balances for
const BASE_TOKENS: Array<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId?: string;
}> = [
  {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
  {
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    coingeckoId: 'dai',
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    coingeckoId: 'weth',
  },
];

/**
 * Make a JSON-RPC call to the Base chain.
 */
async function baseRpc(method: string, params: any[]): Promise<any> {
  const url = ALCHEMY_API_KEY
    ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    : BASE_RPC_URL;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Base RPC error: ${json.error.message}`);
  }
  return json.result;
}

/**
 * Get ETH balance for a wallet on Base chain.
 * Returns balance in ETH (not wei).
 */
export async function getEthBalance(walletAddress: string): Promise<number> {
  const result = await baseRpc('eth_getBalance', [walletAddress, 'latest']);
  if (!result || result === '0x') return 0;
  // result is hex string of wei
  const wei = BigInt(result);
  return formatUnits(wei, 18);
}

/**
 * Get ERC-20 token balance for a specific token.
 * Uses eth_call with balanceOf(address).
 */
async function getErc20Balance(
  tokenAddress: string,
  walletAddress: string,
  decimals: number
): Promise<number> {
  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0');

  try {
    const result = await baseRpc('eth_call', [
      { to: tokenAddress, data },
      'latest',
    ]);

    if (!result || result === '0x') return 0;
    const rawBalance = BigInt(result);
    return formatUnits(rawBalance, decimals);
  } catch (error) {
    console.error(`Failed to fetch ERC-20 balance for ${tokenAddress}:`, error);
    return 0;
  }
}

/**
 * Compute the USD price for a known Base token symbol given the current ETH price.
 * - USDC, DAI: stablecoins, hardcoded $1.00
 * - WETH: tracks ETH price
 * - anything else: undefined (we don't know how to price it)
 */
function knownPriceUsd(symbol: string | undefined, ethPriceUsd: number): number | undefined {
  if (!symbol) return undefined;
  if (symbol === 'USDC' || symbol === 'DAI') return 1.0;
  if (symbol === 'WETH') return ethPriceUsd || undefined;
  return undefined;
}

/**
 * Get all known ERC-20 token balances on Base.
 * If Alchemy is configured, uses alchemy_getTokenBalances for discovery.
 * Otherwise, checks a known list of popular Base tokens.
 *
 * `ethPriceUsd` is required so that WETH (and any other ETH-denominated token)
 * can be priced consistently with the wallet's native ETH balance.
 */
export async function getTokenBalances(
  walletAddress: string,
  ethPriceUsd: number = 0
): Promise<TokenHolding[]> {
  // If Alchemy is available, use their token balance API for broader discovery
  if (ALCHEMY_API_KEY) {
    return getTokenBalancesAlchemy(walletAddress, ethPriceUsd);
  }
  return getTokenBalancesKnownList(walletAddress, ethPriceUsd);
}

/**
 * Check balances for known token list (no API key required).
 */
async function getTokenBalancesKnownList(
  walletAddress: string,
  ethPriceUsd: number
): Promise<TokenHolding[]> {
  const holdings: TokenHolding[] = [];

  const balancePromises = BASE_TOKENS.map(async (token) => {
    const amount = await getErc20Balance(token.address, walletAddress, token.decimals);
    if (amount > 0) {
      const priceUsd = knownPriceUsd(token.symbol, ethPriceUsd);
      holdings.push({
        mint: token.address,
        symbol: token.symbol,
        name: token.name,
        amount,
        decimals: token.decimals,
        priceUsd,
        valueUsd: priceUsd !== undefined ? amount * priceUsd : undefined,
      });
    }
  });

  await Promise.all(balancePromises);
  return holdings;
}

/**
 * Use Alchemy's alchemy_getTokenBalances for comprehensive token discovery.
 */
async function getTokenBalancesAlchemy(
  walletAddress: string,
  ethPriceUsd: number
): Promise<TokenHolding[]> {
  const url = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [walletAddress],
      }),
    });

    const json = await res.json();
    if (json.error || !json.result?.tokenBalances) {
      console.error('Alchemy token balance error:', json.error);
      return getTokenBalancesKnownList(walletAddress, ethPriceUsd); // fallback
    }

    const holdings: TokenHolding[] = [];

    for (const tb of json.result.tokenBalances) {
      if (tb.tokenBalance === '0x0' || tb.tokenBalance === '0x' || !tb.tokenBalance) continue;

      const rawBalance = BigInt(tb.tokenBalance);
      if (rawBalance === BigInt(0)) continue;

      // Look up token metadata
      const known = BASE_TOKENS.find(
        (t) => t.address.toLowerCase() === tb.contractAddress.toLowerCase()
      );

      const decimals = known?.decimals ?? 18;
      const amount = formatUnits(rawBalance, decimals);

      // Only price tokens we recognise; unknown tokens are left unpriced.
      const priceUsd = knownPriceUsd(known?.symbol, ethPriceUsd);

      holdings.push({
        mint: tb.contractAddress,
        symbol: known?.symbol ?? 'UNKNOWN',
        name: known?.name ?? 'Unknown Token',
        amount,
        decimals,
        priceUsd,
        valueUsd: priceUsd !== undefined ? amount * priceUsd : undefined,
      });
    }

    return holdings;
  } catch (error) {
    console.error('Alchemy token balance fetch failed:', error);
    return getTokenBalancesKnownList(walletAddress, ethPriceUsd);
  }
}

/**
 * Fetch ETH price in USD from CoinGecko, cached in Redis for 60s.
 * Prices change much slower than that and CoinGecko's free tier is rate-limited,
 * so caching protects us against bursts of wallet-balance requests.
 */
async function getEthPriceUsd(): Promise<number> {
  const { price } = await getEthPriceData();
  return price;
}

/**
 * Fetch ETH price + 24h change from CoinGecko in a single call. Cached for
 * 60s to protect against bursts and CoinGecko's free-tier rate limits.
 */
async function getEthPriceData(): Promise<{ price: number; change24h: number }> {
  return getOrSetCache<{ price: number; change24h: number }>(
    'price:eth-usd:full',
    60,
    async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true',
          { headers: { Accept: 'application/json' } }
        );
        const json = await res.json();
        return {
          price: json?.ethereum?.usd ?? 0,
          change24h: json?.ethereum?.usd_24h_change ?? 0,
        };
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
        return { price: 0, change24h: 0 };
      }
    },
  );
}

/**
 * Fetch complete wallet balance for Base chain.
 * Equivalent to fetchWalletBalance() in helius.ts.
 */
export async function fetchBaseWalletBalance(walletAddress: string): Promise<WalletBalance> {
  // ETH price is fetched first so it can be threaded into token pricing
  // (e.g. so WETH gets a valueUsd). It's cached, so this is essentially free
  // on the hot path.
  const { price: ethPriceUsd, change24h: ethChange24h } = await getEthPriceData();

  const [ethBalance, tokens] = await Promise.all([
    getEthBalance(walletAddress),
    getTokenBalances(walletAddress, ethPriceUsd),
  ]);

  const ethValueUsd = ethBalance * ethPriceUsd;
  const tokenValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);
  const totalValueUsd = ethValueUsd + tokenValueUsd;

  return {
    chain: 'base',
    nativeBalance: ethBalance,
    nativePriceUsd: ethPriceUsd || undefined,
    nativeSymbol: 'ETH',

    // Legacy fields for backward compat with existing Solana-shaped consumers
    solBalance: 0,
    solPriceUsd: 0,

    tokens,
    totalValueUsd: totalValueUsd || undefined,
    // Native asset 24h change. The mobile wallet screen displays this
    // as the headline "(24h)" indicator.
    change24h: ethChange24h,
  };
}
