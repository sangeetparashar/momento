/**
 * Environment configuration sourced from Expo public environment variables.
 * All values are read from process.env.EXPO_PUBLIC_* at build time.
 */
export const ENV = {
  /** Base URL for the Momento API */
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001',

  /** Privy application ID for wallet authentication */
  PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',

  /** Solana RPC endpoint URL */
  SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',

  /**
   * Helius RPC endpoint URL used for signing/sending transactions.
   * Matches the value consumed by useSwap. Falls back to mainnet-beta.
   */
  HELIUS_RPC_URL: process.env.EXPO_PUBLIC_HELIUS_RPC_URL ?? 'https://api.mainnet-beta.solana.com',

  /**
   * Gates the best-effort fee/trade feed hooks (trades, fees, creator fees).
   * These read routes are not yet in the binding backend contract; default OFF.
   */
  FEES_FEED_ENABLED: (process.env.EXPO_PUBLIC_FEES_FEED_ENABLED ?? 'false') === 'true',

  /** Solana network: 'devnet' | 'mainnet-beta' */
  SOLANA_NETWORK: (process.env.EXPO_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta',

  /** Whether the app is running in development mode */
  IS_DEV: __DEV__,
} as const;

if (__DEV__) {
  console.log('[ENV] API_URL =', ENV.API_URL);
  console.log('[ENV] PRIVY_APP_ID =', ENV.PRIVY_APP_ID || '(empty)');
  console.log('[ENV] SOLANA_NETWORK =', ENV.SOLANA_NETWORK);
}
