import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getWalletForChain } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Supported fiat onramp providers.
 */
const PROVIDERS = ['ramp', 'moonpay', 'transak'] as const;
type OnrampProvider = (typeof PROVIDERS)[number];

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

  // Ramp asset code format is {CHAIN}_{SYMBOL}, e.g. SOLANA_USDC.
  // Verified 2026-04-07 against https://api.ramp.network/api/host-api/v3/assets
  const swapAsset = 'SOLANA_USDC';

  const params = new URLSearchParams({
    hostApiKey: apiKey,
    hostAppName: 'Momento',
    swapAsset,
    userAddress: walletAddress,
    defaultAsset: swapAsset,
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

  // MoonPay currency codes are network-suffixed: usdc_sol.
  // Verified 2026-04-07 against https://api.moonpay.com/v3/currencies
  const currencyCode = 'usdc_sol';

  const params = new URLSearchParams({
    apiKey: apiKey || 'pk_test_123',
    currencyCode,
    walletAddress,
    baseCurrencyCode: 'usd',
    colorCode: '#00FF88',
    showWalletAddressForm: 'false',
  });

  return `${base}?${params.toString()}`;
}

/**
 * Transak Secure Widget URL integration (2-step flow).
 *
 * Step 1: Exchange API Key + API Secret for an access token (cached 6 days).
 * Step 2: Use access token to create a single-use widget URL (valid 5 min).
 *
 * Direct URL params are deprecated — Transak now requires server-side
 * widget URL creation via their API gateway.
 */

// In-memory cache for the Transak access token (valid 7 days, we cache 6)
let _transakAccessToken: string | null = null;
let _transakTokenExpiry = 0;

function getTransakConfig() {
  const env = process.env.TRANSAK_ENVIRONMENT || 'STAGING';
  const apiKey =
    env === 'PRODUCTION'
      ? process.env.TRANSAK_API_KEY || ''
      : process.env.TRANSAK_API_KEY_STAGING || process.env.TRANSAK_API_KEY || '';
  const apiSecret =
    env === 'PRODUCTION'
      ? process.env.TRANSAK_API_SECRET || ''
      : process.env.TRANSAK_API_SECRET_STAGING || process.env.TRANSAK_API_SECRET || '';
  const apiBase =
    env === 'PRODUCTION'
      ? 'https://api.transak.com'
      : 'https://api-stg.transak.com';
  const gatewayBase =
    env === 'PRODUCTION'
      ? 'https://api-gateway.transak.com'
      : 'https://api-gateway-stg.transak.com';

  return { env, apiKey, apiSecret, apiBase, gatewayBase };
}

async function getTransakAccessToken(): Promise<string> {
  // Return cached token if still valid (with 1-day buffer)
  if (_transakAccessToken && Date.now() < _transakTokenExpiry) {
    return _transakAccessToken;
  }

  const { apiKey, apiSecret, apiBase } = getTransakConfig();
  if (!apiKey || !apiSecret) {
    throw new Error('Missing TRANSAK_API_KEY or TRANSAK_API_SECRET');
  }

  const res = await fetch(`${apiBase}/partners/api/v2/refresh-token`, {
    method: 'POST',
    headers: {
      'api-secret': apiSecret,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transak refresh-token failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  _transakAccessToken = json.data.accessToken;
  // Cache for 6 days (token valid 7 days)
  _transakTokenExpiry = Date.now() + 6 * 24 * 60 * 60 * 1000;

  return _transakAccessToken!;
}

/**
 * Build Transak widget URL via direct URL params (no 2-step API flow).
 * The direct URL approach is simpler and more reliable — it only needs
 * the API key, no secret or access token exchange.
 *
 * Falls back to the 2-step API flow only if needed for advanced features.
 */
function buildTransakDirectUrl(walletAddress: string): string {
  const { env, apiKey } = getTransakConfig();

  const base =
    env === 'PRODUCTION'
      ? 'https://global.transak.com'
      : 'https://global-stg.transak.com';

  // Transak network slug is lowercase chain name.
  // Verified 2026-04-07 against https://api.transak.com/api/v2/currencies/crypto-currencies
  const network = 'solana';

  const params = new URLSearchParams({
    apiKey,
    cryptoCurrencyCode: 'USDC',
    network,
    walletAddress,
    defaultCryptoCurrency: 'USDC',
    fiatCurrency: 'USD',
    productsAvailed: 'BUY',
    disableWalletAddressForm: 'true',
    hideMenu: 'true',
    themeColor: '00FF88',
  });

  return `${base}?${params.toString()}`;
}

async function buildTransakUrl(walletAddress: string): Promise<string> {
  const network = 'solana';

  // Try the 2-step API flow first (better UX, pre-authenticated session)
  try {
    const { apiKey, gatewayBase } = getTransakConfig();
    const accessToken = await getTransakAccessToken();

    const res = await fetch(`${gatewayBase}/api/v2/auth/session`, {
      method: 'POST',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        widgetParams: {
          apiKey,
          referrerDomain: 'momento-api-ten.vercel.app',
          cryptoCurrencyCode: 'USDC',
          network,
          walletAddress,
          defaultCryptoCurrency: 'USDC',
          fiatCurrency: 'USD',
          productsAvailed: 'BUY',
          disableWalletAddressForm: true,
          hideMenu: true,
          themeColor: '00FF88',
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Transak] 2-step API failed (${res.status}): ${body} — falling back to direct URL`);
      // Clear cached token so next attempt re-authenticates
      _transakAccessToken = null;
      _transakTokenExpiry = 0;
      return buildTransakDirectUrl(walletAddress);
    }

    const json = await res.json();
    return json.data.widgetUrl;
  } catch (err: any) {
    console.warn('[Transak] 2-step API error:', err.message, '— falling back to direct URL');
    // Clear cached token
    _transakAccessToken = null;
    _transakTokenExpiry = 0;
    return buildTransakDirectUrl(walletAddress, chain);
  }
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

    const { searchParams } = new URL(request.url);
    const provider = (searchParams.get('provider') || 'ramp') as OnrampProvider;

    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Unsupported provider. Use: ${PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Resolve the user's Solana wallet address
    const walletAddress = getWalletForChain(user);
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'No solana wallet found. Please try again in a moment.' },
        { status: 400 }
      );
    }

    let url: string;
    switch (provider) {
      case 'ramp':
        url = buildRampUrl(walletAddress);
        break;
      case 'moonpay':
        url = buildMoonPayUrl(walletAddress);
        break;
      case 'transak':
        url = await buildTransakUrl(walletAddress);
        break;
    }

    return NextResponse.json({
      success: true,
      data: {
        url,
        provider,
        coin: 'USDC',
        walletAddress,
        chain: 'solana',
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
