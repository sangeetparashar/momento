import type { TokenHolding, WalletBalance, PostWithCreator, PublicCreator } from '@momento/shared';
import { PostType, UserRole, KycStatus } from '@momento/shared';

/**
 * Hardcoded ticker data for the MVP marquee / trending bar.
 */
export const DUMMY_TICKER_DATA = [
  { symbol: 'DEEL', price: 0.0342, change24h: 12.5 },
  { symbol: 'BELLE', price: 0.0187, change24h: -3.2 },
  { symbol: 'NAAN', price: 0.0891, change24h: 8.7 },
  { symbol: 'AURA', price: 0.1245, change24h: 24.1 },
  { symbol: 'SEAM', price: 0.0056, change24h: -1.5 },
  { symbol: 'TASH', price: 0.0423, change24h: 45.2 },
  { symbol: 'TEAH', price: 0.0312, change24h: 18.9 },
  { symbol: 'TWSH', price: 0.0078, change24h: 7.3 },
  { symbol: 'CHCTS', price: 0.0034, change24h: -2.1 },
] as const;

/**
 * Hardcoded market data for the MVP discovery / market screen.
 */
export const DUMMY_MARKET_DATA: TokenHolding[] = [
  {
    mint: 'DummyMint1111111111111111111111111111111111',
    symbol: 'DEEL',
    name: 'Deel Token',
    amount: 15000,
    decimals: 9,
    logoUrl: undefined,
    priceUsd: 0.0342,
    valueUsd: 513.0,
    change24h: 12.5,
  },
  {
    mint: 'DummyMint2222222222222222222222222222222222',
    symbol: 'BELLE',
    name: 'Belle Token',
    amount: 8500,
    decimals: 9,
    logoUrl: undefined,
    priceUsd: 0.0187,
    valueUsd: 158.95,
    change24h: -3.2,
  },
  {
    mint: 'DummyMint3333333333333333333333333333333333',
    symbol: 'NAAN',
    name: 'Naan Token',
    amount: 22000,
    decimals: 9,
    logoUrl: undefined,
    priceUsd: 0.0891,
    valueUsd: 1960.2,
    change24h: 8.7,
  },
  {
    mint: 'DummyMint4444444444444444444444444444444444',
    symbol: 'AURA',
    name: 'Aura Token',
    amount: 5000,
    decimals: 9,
    logoUrl: undefined,
    priceUsd: 0.1245,
    valueUsd: 622.5,
    change24h: 24.1,
  },
  {
    mint: 'DummyMint5555555555555555555555555555555555',
    symbol: 'SEAM',
    name: 'Seam Token',
    amount: 45000,
    decimals: 9,
    logoUrl: undefined,
    priceUsd: 0.0056,
    valueUsd: 252.0,
    change24h: -1.5,
  },
];

/**
 * Hardcoded wallet balance for unauthenticated / demo state.
 */
export const DUMMY_WALLET_BALANCE: WalletBalance = {
  solBalance: 2.45,
  tokens: DUMMY_MARKET_DATA,
  totalValueUsd: 3506.65,
  change24h: 8.3,
  earningsToDate: 1245.5,
};

/**
 * Hardcoded creators for the discovery / nearby section.
 */
export const DUMMY_CREATORS: PublicCreator[] = [
  {
    id: 'creator-1',
    username: 'deelmusic',
    displayName: 'Deel',
    bio: 'Independent artist from LA. Making beats that move you.',
    avatarUrl: undefined,
    bannerUrl: undefined,
    tokenSymbol: 'DEEL',
    socialLinks: { instagram: 'deelmusic', twitter: 'deelmusic' },
    followerCount: 12400,
    postCount: 89,
  },
  {
    id: 'creator-2',
    username: 'bellecreates',
    displayName: 'Belle',
    bio: 'Digital artist & photographer. Capturing moments in pixels.',
    avatarUrl: undefined,
    bannerUrl: undefined,
    tokenSymbol: 'BELLE',
    socialLinks: { instagram: 'bellecreates', website: 'https://belle.art' },
    followerCount: 8900,
    postCount: 156,
  },
  {
    id: 'creator-3',
    username: 'naanofficial',
    displayName: 'Naan',
    bio: 'Chef & content creator. Bringing flavor to your feed.',
    avatarUrl: undefined,
    bannerUrl: undefined,
    tokenSymbol: 'NAAN',
    socialLinks: { youtube: 'naanofficial', tiktok: 'naanofficial' },
    followerCount: 34200,
    postCount: 312,
  },
];

/**
 * Hardcoded feed posts for the MVP feed screen.
 */
export const DUMMY_FEED_POSTS: PostWithCreator[] = [
  {
    id: 'post-1',
    creatorId: 'creator-1',
    postType: PostType.IMAGE,
    content: undefined,
    caption: 'New track dropping this Friday. Stay tuned for something special.',
    mediaUrl: undefined,
    mediaUrls: [],
    latitude: 34.0522,
    longitude: -118.2437,
    likeCount: 342,
    commentCount: 28,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    creator: DUMMY_CREATORS[0],
    isLiked: false,
  },
  {
    id: 'post-2',
    creatorId: 'creator-2',
    postType: PostType.IMAGE,
    content: undefined,
    caption: 'Golden hour at the pier. Sometimes the best moments are unplanned.',
    mediaUrl: undefined,
    mediaUrls: [],
    latitude: 34.0195,
    longitude: -118.4912,
    likeCount: 567,
    commentCount: 45,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    creator: DUMMY_CREATORS[1],
    isLiked: true,
  },
  {
    id: 'post-3',
    creatorId: 'creator-3',
    postType: PostType.TEXT,
    content: 'Just hit 30k followers! To celebrate, I am doing a live cooking session tomorrow at 6 PM PST. Drop your recipe requests below.',
    caption: undefined,
    mediaUrl: undefined,
    mediaUrls: [],
    latitude: 34.0407,
    longitude: -118.2468,
    likeCount: 1203,
    commentCount: 187,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    creator: DUMMY_CREATORS[2],
    isLiked: false,
  },
];
