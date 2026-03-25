import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Supported fiat onramp providers.
 */
const PROVIDERS = ['transak', 'moonpay'] as const;
type OnrampProvider = (typeof PROVIDERS)[number];

/**
 * Supported stablecoins for onramp. USDC is the default.
 */
const SUPPORTED_COINS: Record<string, { cryptoCurrency: string; network: string }> = {
  USDC: { cryptoCurrency: 'USDC', network: 'solana' },
  USDT: { cryptoCurrency: 'USDT', network: 'solana' },
};

/**
 * Builds a Transak onramp URL for the given wallet and coin.
 */
function buildTransakUrl(walletAddress: string, coin: string): string {
  const apiKey = process.env.TRANSAK_API_KEY;
  const env = process.env.TRANSAK_ENVIRONMENT || 'STAGING';

  const base =
    env === 'PRODUCTION'
      ? 'https://global.transak.com'
      : 'https://global-stg.transak.com';

  const config = SUPPORTED_COINS[coin] || SUPPORTED_COINS.USDC;

  const params = new URLSearchParams({
    apiKey: apiKey || 'b98281c0-e5cd-4a54-b333-91bdd648be73', // Transak test key
    environment: env,
    cryptoCurrencyCode: config.cryptoCurrency,
    network: config.network,
    walletAddress,
    defaultCryptoCurrency: config.cryptoCurrency,
    defaultNetwork: config.network,
    disableWalletAddressForm: 'true',
    hideMenu: 'true',
    themeColor: '00FF88',
    productsAvailed: 'BUY',
  });

  return `${base}?${params.toString()}`;
}

/**
 * Builds a MoonPay onramp URL for the given wallet and coin.
 */
function buildMoonPayUrl(walletAddress: string, coin: string): string {
  const apiKey = process.env.MOONPAY_API_KEY;
  const env = process.env.MOONPAY_ENVIRONMENT || 'sandbox';

  const base =
    env === 'production'
      ? 'https://buy.moonpay.com'
      : 'https://buy-sandbox.moonpay.com';

  const currencyCode = coin === 'USDT' ? 'usdt_sol' : 'usdc_sol';

  const params = new URLSearchParams({
    apiKey: apiKey || 'pk_test_key', // placeholder for sandbox
    currencyCode,
    walletAddress,
    colorCode: '#00FF88',
    showWalletAddressForm: 'false',
  });

  return `${base}?${params.toString()}`;
}

/**
 * GET /api/wallet/onramp
 *
 * Returns a URL to open in a WebView for fiat → stablecoin onramp.
 *
 * Query params:
 *   - provider: 'transak' | 'moonpay' (default: 'transak')
 *   - coin: 'USDC' | 'USDT' (default: 'USDC')
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await applyRateLimit(request, readLimiter);
    if (rateLimitResponse) return rateLimitResponse;

    const user = await requireAuth(request);

    if (!user.walletAddress || user.walletAddress.startsWith('pending-')) {
      return NextResponse.json(
        { success: false, error: 'Wallet not ready. Please try again in a moment.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const provider = (searchParams.get('provider') || 'transak') as OnrampProvider;
    const coin = (searchParams.get('coin') || 'USDC').toUpperCase();

    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Unsupported provider. Use: ${PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!SUPPORTED_COINS[coin]) {
      return NextResponse.json(
        { success: false, error: `Unsupported coin. Use: ${Object.keys(SUPPORTED_COINS).join(', ')}` },
        { status: 400 }
      );
    }

    const url =
      provider === 'moonpay'
        ? buildMoonPayUrl(user.walletAddress, coin)
        : buildTransakUrl(user.walletAddress, coin);

    return NextResponse.json({
      success: true,
      data: {
        url,
        provider,
        coin,
        walletAddress: user.walletAddress,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Onramp URL generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate onramp URL' },
      { status: 500 }
    );
  }
}
