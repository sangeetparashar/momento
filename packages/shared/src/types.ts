// Enums
export enum UserRole {
  USER = 'USER',
  CREATOR = 'CREATOR',
}

export enum KycStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum PostType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

// User types
export interface SocialLinks {
  youtube?: string;
  instagram?: string;
  twitter?: string;
  spotify?: string;
  soundcloud?: string;
  tiktok?: string;
  website?: string;
}

// Note: pushToken is intentionally excluded from the User interface.
// It is stored in the database but never exposed to clients for privacy/security.
export interface User {
  id: string;
  privyUserId: string;
  walletAddress: string;
  email?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  role: UserRole;
  kycStatus: KycStatus;
  isAdminApproved: boolean;
  isAdmin: boolean;
  tokenSymbol?: string;
  socialLinks?: SocialLinks;
  locationLat?: number;
  locationLng?: number;
  followerCount: number;
  followingCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCreator {
  id: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  tokenSymbol?: string;
  socialLinks?: SocialLinks;
  followerCount: number;
  followingCount?: number;
  postCount: number;
  role?: string;
  createdAt?: string;
  distanceMeters?: number;
  city?: string;
}

// Post types
export interface Post {
  id: string;
  creatorId: string;
  postType: PostType;
  content?: string;
  caption?: string;
  mediaUrl?: string;
  mediaUrls?: string[] | null;
  latitude: number;
  longitude: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostWithCreator extends Post {
  creator: PublicCreator;
  isLiked?: boolean;
  isSaved?: boolean;
  distanceMeters?: number;
}

// Comment types
export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

// Wallet types
export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  logoUrl?: string;
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
}

export interface WalletBalance {
  solBalance: number;
  solPriceUsd?: number;
  tokens: TokenHolding[];
  totalValueUsd?: number;
  change24h?: number;
  earningsToDate?: number;
}

export interface PricePoint {
  t: number; // timestamp ms
  p: number; // price usd
}

export interface PortfolioPoint {
  t: number;      // timestamp ms
  p: number;      // total portfolio value usd
  sol: number;    // sol value usd
  tokens: number; // token value usd
}

// Onramp types
export type OnrampProvider = 'ramp' | 'moonpay' | 'transak';
export type OnrampCoin = 'USDC';

export interface OnrampUrlResponse {
  url: string;
  provider: OnrampProvider;
  coin: string;
  walletAddress: string;
}

// Swap types
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  platformFee?: { amount: string; feeBps: number };
  raw: any;
}

export interface SwapTransactionResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

// API Response types
export interface FeedResponse {
  posts: PostWithCreator[];
  nextCursor?: string;
  page?: number;
  hasMore: boolean;
  sort?: string;
}

export interface NearbyCreatorsResponse {
  creators: PublicCreator[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface FollowResponse {
  following: boolean;
  followerCount: number;
}

export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

export interface CommentsResponse {
  comments: Comment[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface UploadPresignResponse {
  uploadUrl: string;
  publicUrl: string;
  path: string;
}

export interface KycApplicationResponse {
  status: string;
  verificationUrl?: string;
  sessionId?: string;
  message?: string;
  user?: {
    id: string;
    role: string;
    kycStatus: string;
    isAdminApproved: boolean;
  };
}

const SOCIAL_LINK_KEYS: ReadonlySet<string> = new Set([
  'youtube', 'instagram', 'twitter', 'spotify', 'soundcloud', 'tiktok', 'website',
]);

/**
 * Runtime validator for SocialLinks JSON blobs from the database.
 * Returns a valid SocialLinks object or undefined if the input is not valid.
 */
export function parseSocialLinks(value: unknown): SocialLinks | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SOCIAL_LINK_KEYS.has(key) && typeof val === 'string' && val.length > 0) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? (result as SocialLinks) : undefined;
}
