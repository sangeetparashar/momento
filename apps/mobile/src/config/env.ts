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

  /** Solana network: 'devnet' | 'mainnet-beta' */
  SOLANA_NETWORK: (process.env.EXPO_PUBLIC_SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet-beta',

  /** Base L2 RPC endpoint URL */
  BASE_RPC_URL: process.env.EXPO_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org',

  /** Base L2 chain ID (8453 = mainnet, 84532 = Sepolia testnet) */
  BASE_CHAIN_ID: parseInt(process.env.EXPO_PUBLIC_BASE_CHAIN_ID ?? '8453', 10),

  /** Base network: 'mainnet' | 'testnet' */
  BASE_NETWORK: (process.env.EXPO_PUBLIC_BASE_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet',

  /** Whether the app is running in development mode */
  IS_DEV: __DEV__,
} as const;

if (__DEV__) {
  console.log('[ENV] API_URL =', ENV.API_URL);
  console.log('[ENV] PRIVY_APP_ID =', ENV.PRIVY_APP_ID || '(empty)');
  console.log('[ENV] SOLANA_NETWORK =', ENV.SOLANA_NETWORK);
}
