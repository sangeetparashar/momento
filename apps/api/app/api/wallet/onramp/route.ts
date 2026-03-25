import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { readLimiter, applyRateLimit } from '@/lib/ratelimit';

/**
 * Supported fiat onramp providers.
 */
const PROVIDERS = ['transak', 'stripe'] as const;
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
 * Builds a Stripe hosted crypto onramp URL.
 *
 * Uses the Stripe-hosted standalone approach which generates a redirect URL
 * to crypto.link.com. The user completes the purchase there and funds are
 * sent to their Solana wallet.
 *
 * When STRIPE_CRYPTO_SECRET_KEY is set, creates a session via the API for
 * full customization (wallet pre-fill). Otherwise falls back to the
 * client-side URL generation approach via the standalone page.
 */
async function buildStripeUrl(walletAddress: string, coin: string): Promise<string> {
  const secretKey = process.env.STRIPE_CRYPTO_SECRET_KEY;
  const destinationCurrency = coin.toLowerCase(); // 'usdc'

  // If we have a secret key, create a session via the Stripe API
  if (secretKey) {
    const response = await fetch('https://api.stripe.com/v1/crypto/onramp_sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'transaction_details[destination_currency]': destinationCurrency,
        'transaction_details[destination_network]': 'solana',
        'transaction_details[wallet_address]': walletAddress,
        'customer_ip_address': '0.0.0.0', // Will be overridden by Stripe
      }).toString(),
    });

    const session = await response.json();

    if (session.error) {
      console.error('Stripe onramp session error:', session.error);
      throw new Error(session.error.message || 'Failed to create Stripe session');
    }

    if (session.redirect_url) {
      return session.redirect_url;
    }
  }

  // Fallback: build a standalone hosted URL (no secret key needed)
  const params = new URLSearchParams({
    destination_currency: destinationCurrency,
    destination_network: 'solana',
    destination_currencies: destinationCurrency,
    destination_networks: 'solana',
  });

  return `https://crypto.link.com?${params.toString()}`;
}

/**
 * GET /api/wallet/onramp
 *
 * Returns a URL to open in a WebView for fiat → stablecoin onramp.
 *
 * Query params:
 *   - provider: 'transak' | 'stripe' (default: 'transak')
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

    let url: string;
    if (provider === 'stripe') {
      url = await buildStripeUrl(user.walletAddress, coin);
    } else {
      url = buildTransakUrl(user.walletAddress, coin);
    }

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
