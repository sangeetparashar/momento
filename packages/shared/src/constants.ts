export const SOCIAL_PLATFORMS = {
  youtube: { icon: 'logo-youtube', color: '#FF0000', urlPrefix: 'https://youtube.com/' },
  instagram: { icon: 'logo-instagram', color: '#E4405F', urlPrefix: 'https://instagram.com/' },
  twitter: { icon: 'logo-twitter', color: '#1DA1F2', urlPrefix: 'https://twitter.com/' },
  spotify: { icon: 'musical-notes', color: '#1DB954', urlPrefix: 'https://open.spotify.com/' },
  soundcloud: { icon: 'cloud', color: '#FF5500', urlPrefix: 'https://soundcloud.com/' },
  tiktok: { icon: 'musical-note', color: '#000000', urlPrefix: 'https://tiktok.com/@' },
  website: { icon: 'globe', color: '#8A8A8A', urlPrefix: '' },
} as const;

export const CHAIN_CONFIG = {
  solana: {
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    nativeIcon: '◎',
    iconColor: '#9945FF',
    explorerUrl: 'https://solscan.io',
    explorerName: 'Solscan',
    usdcAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    usdcDecimals: 6,
  },
  base: {
    name: 'Base',
    symbol: 'ETH',
    decimals: 18,
    nativeIcon: 'Ξ',
    iconColor: '#0052FF',
    explorerUrl: 'https://basescan.org',
    explorerName: 'BaseScan',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    usdcDecimals: 6,
  },
} as const;

export type ChainConfig = typeof CHAIN_CONFIG;
