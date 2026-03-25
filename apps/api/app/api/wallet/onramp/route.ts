import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Supported fiat onramp providers.
 */
const PROVIDERS = ['ramp', 'moonpay', 'transak'] as const;
type OnrampProvider = (typeof PROVIDERS)[number];

/**
 * Supported stablecoins for onramp. USDC is the default and primary coin.
 */
const SUPPORTED_COINS: Record<string, { cryptoCurrency: string; network: string }> = {
  USDC: { cryptoCurrency: 'USDC', network: 'solana' },
};

/**
 * Builds a Ramp Network hosted onramp URL.
 *
 * Ramp has the lowest compliance burden (0.49-2.9% fees), supports
 * Apple Pay, Google Pay, cards, and bank transfers across 150+ countries.
 * Asset code format: SOLANA_USDC
 */
function buildRampUrl(walletAddress: string): string {
  const apiKey = process.env.RAMP_API_KEY || '';
  const env = process.env.RAMP_ENVIRONMENT || 'sandbox';

  const base =
    env === 'production'
      ? 'https://app.rampnetwork.com'
      : 'https://app.demo.rampnetwork.com';

  const params = new URLSearchParams({
    hostApiKey: apiKey,
    hostAppName: 'Momento',
    swapAsset: 'SOLANA_USDC',
    userAddress: walletAddress,
    defaultAsset: 'SOLANA_USDC',
    fiatCurrency: 'USD',
  });

  return `${base}?${params.toString()}`;
}

/**
 * Builds a MoonPay onramp URL.
 *
 * MoonPay supports Apple Pay, Google Pay, PayPal, Venmo, cards, and bank
 * transfers across 180+ countries. Currency code: usdc_sol.
 */
function buildMoonPayUrl(walletAddress: string): string {
  const apiKey = process.env.MOONPAY_API_KEY;
  const env = process.env.MOONPAY_ENVIRONMENT || 'sandbox';

  const base =
    env === 'production'
      ? 'https://buy.moonpay.com'
      : 'https://buy-sandbox.moonpay.com';

  const params = new URLSearchParams({
    apiKey: apiKey || 'pk_test_123',
    currencyCode: 'usdc_sol',
    walletAddress,
    baseCurrencyCode: 'usd',
    colorCode: '#00FF88',
    showWalletAddressForm: 'false',
  });

  return `${base}?${params.toString()}`;
}

/**
 * Builds a Transak onramp URL.
 *
 * Transak supports Apple Pay, Google Pay, cards, and bank transfers.
 * Lower fees (1-5%) with Lite KYC in some regions.
 */
function buildTransakUrl(walletAddress: string): string {
  const apiKey = process.env.TRANSAK_API_KEY;
  const env = process.env.TRANSAK_ENVIRONMENT || 'STAGING';

  const base =
    env === 'PRODUCTION'
      ? 'https://global.transak.com'
      : 'https://global-stg.transak.com';

  const params = new URLSearchParams({
    apiKey: apiKey || 'b98281c0-e5cd-4a54-b333-91bdd648be73',
    environment: env,
    cryptoCurrencyCode: 'USDC',
    network: 'solana',
    walletAddress,
    defaultCryptoCurrency: 'USDC',
    defaultNetwork: 'solana',
    disableWalletAddressForm: 'true',
    hideMenu: 'true',
    themeColor: '00FF88',
    productsAvailed: 'BUY',
  });

  return `${base}?${params.toString()}`;
}

/**
 * GET /api/wallet/onramp
 *
 * Returns a URL to open in a WebView for fiat → USDC on Solana.
 *
 * Query params:
 *   - provider: 'ramp' | 'moonpay' | 'transak' (default: 'ramp')
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
    const provider = (searchParams.get('provider') || 'ramp') as OnrampProvider;

    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Unsupported provider. Use: ${PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    let url: string;
    switch (provider) {
      case 'ramp':
        url = buildRampUrl(user.walletAddress);
        break;
      case 'moonpay':
        url = buildMoonPayUrl(user.walletAddress);
        break;
      case 'transak':
        url = buildTransakUrl(user.walletAddress);
        break;
    }

    return NextResponse.json({
      success: true,
      data: {
        url,
        provider,
        coin: 'USDC',
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
