import type { TokenHolding, WalletBalance } from '@momento/shared';

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

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
  return Number(wei) / 1e18;
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
    return Number(rawBalance) / Math.pow(10, decimals);
  } catch (error) {
    console.error(`Failed to fetch ERC-20 balance for ${tokenAddress}:`, error);
    return 0;
  }
}

/**
 * Get all known ERC-20 token balances on Base.
 * If Alchemy is configured, uses alchemy_getTokenBalances for discovery.
 * Otherwise, checks a known list of popular Base tokens.
 */
export async function getTokenBalances(walletAddress: string): Promise<TokenHolding[]> {
  // If Alchemy is available, use their token balance API for broader discovery
  if (ALCHEMY_API_KEY) {
    return getTokenBalancesAlchemy(walletAddress);
  }
  return getTokenBalancesKnownList(walletAddress);
}

/**
 * Check balances for known token list (no API key required).
 */
async function getTokenBalancesKnownList(walletAddress: string): Promise<TokenHolding[]> {
  const holdings: TokenHolding[] = [];

  const balancePromises = BASE_TOKENS.map(async (token) => {
    const amount = await getErc20Balance(token.address, walletAddress, token.decimals);
    if (amount > 0) {
      holdings.push({
        mint: token.address,
        symbol: token.symbol,
        name: token.name,
        amount,
        decimals: token.decimals,
        priceUsd: token.symbol === 'USDC' ? 1.0 : undefined,
        valueUsd: token.symbol === 'USDC' ? amount : undefined,
      });
    }
  });

  await Promise.all(balancePromises);
  return holdings;
}

/**
 * Use Alchemy's alchemy_getTokenBalances for comprehensive token discovery.
 */
async function getTokenBalancesAlchemy(walletAddress: string): Promise<TokenHolding[]> {
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
      return getTokenBalancesKnownList(walletAddress); // fallback
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
      const amount = Number(rawBalance) / Math.pow(10, decimals);

      holdings.push({
        mint: tb.contractAddress,
        symbol: known?.symbol ?? 'UNKNOWN',
        name: known?.name ?? 'Unknown Token',
        amount,
        decimals,
        priceUsd: known?.symbol === 'USDC' ? 1.0 : undefined,
        valueUsd: known?.symbol === 'USDC' ? amount : undefined,
      });
    }

    return holdings;
  } catch (error) {
    console.error('Alchemy token balance fetch failed:', error);
    return getTokenBalancesKnownList(walletAddress);
  }
}

/**
 * Fetch ETH price in USD from CoinGecko.
 */
async function getEthPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const json = await res.json();
    return json?.ethereum?.usd ?? 0;
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    return 0;
  }
}

/**
 * Fetch complete wallet balance for Base chain.
 * Equivalent to fetchWalletBalance() in helius.ts.
 */
export async function fetchBaseWalletBalance(walletAddress: string): Promise<WalletBalance> {
  const [ethBalance, tokens, ethPriceUsd] = await Promise.all([
    getEthBalance(walletAddress),
    getTokenBalances(walletAddress),
    getEthPriceUsd(),
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
    change24h: 0,
  };
}
