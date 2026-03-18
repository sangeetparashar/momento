import { TokenHolding, WalletBalance } from '@momento/shared';

function getHeliusConfig() {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('Missing HELIUS_API_KEY environment variable');
  return {
    apiKey,
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
    apiUrl: 'https://api.helius.xyz/v0',
  };
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Fetches the SOL balance for a wallet address using the Helius RPC endpoint.
 */
async function getSolBalance(walletAddress: string): Promise<number> {
  const { rpcUrl } = getHeliusConfig();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [walletAddress],
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Helius RPC error: ${data.error.message}`);
  }

  return (data.result?.value || 0) / LAMPORTS_PER_SOL;
}

/**
 * Fetches all token balances and metadata for a wallet using the Helius DAS API.
 */
async function getTokenBalances(walletAddress: string): Promise<TokenHolding[]> {
  const { rpcUrl } = getHeliusConfig();
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'searchAssets',
      params: {
        ownerAddress: walletAddress,
        tokenType: 'fungible',
        displayOptions: {
          showFungible: true,
        },
      },
    }),
  });

  const data = await response.json();
  if (data.error) {
    console.error('Helius token fetch error:', data.error);
    return [];
  }

  const items = data.result?.items || [];

  return items.map((item: any) => {
    const tokenInfo = item.token_info || {};
    const metadata = item.content?.metadata || {};
    const links = item.content?.links || {};

    const decimals = tokenInfo.decimals || 0;
    const rawBalance = tokenInfo.balance || 0;
    const amount = rawBalance / Math.pow(10, decimals);
    const priceUsd = tokenInfo.price_info?.price_per_token || null;
    const valueUsd = priceUsd ? amount * priceUsd : null;

    return {
      mint: item.id,
      symbol: tokenInfo.symbol || metadata.symbol || 'UNKNOWN',
      name: metadata.name || tokenInfo.symbol || 'Unknown Token',
      amount,
      decimals,
      logoUrl: links.image || item.content?.files?.[0]?.uri || null,
      priceUsd,
      valueUsd,
      change24h: tokenInfo.price_info?.price_change_24h || null,
    };
  });
}

/**
 * Fetches the complete wallet balance including SOL and all token holdings.
 */
export async function fetchWalletBalance(walletAddress: string): Promise<WalletBalance> {
  const [solBalance, tokens] = await Promise.all([
    getSolBalance(walletAddress),
    getTokenBalances(walletAddress),
  ]);

  // Fetch SOL price for total value calculation
  let solPriceUsd = 0;
  try {
    const { apiKey, apiUrl } = getHeliusConfig();
    const priceResponse = await fetch(
      `${apiUrl}/token-metadata?api-key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAccounts: ['So11111111111111111111111111111111111111112'],
          includeOffChain: false,
          disableCache: false,
        }),
      }
    );
    const priceData = await priceResponse.json();
    solPriceUsd = priceData?.[0]?.legacyMetadata?.price || 0;
  } catch (error) {
    console.error('Failed to fetch SOL price:', error);
  }

  const solValueUsd = solBalance * solPriceUsd;
  const tokenTotalValueUsd = tokens.reduce(
    (sum, token) => sum + (token.valueUsd || 0),
    0
  );
  const totalValueUsd = solValueUsd + tokenTotalValueUsd;

  return {
    solBalance,
    tokens,
    totalValueUsd: totalValueUsd || undefined,
  };
}
