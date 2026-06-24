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

// Solana-only after the 2026-06 migration. Kept as a 1-member union (not deleted)
// so existing `ChainType` annotations keep compiling and any leftover `=== 'base'`
// branch becomes a type error. See docs/solana-migration/README.md.
export type ChainType = 'solana';

export enum TokenStatus {
  PENDING = 'PENDING',
  DEPLOYING = 'DEPLOYING',
  ACTIVE = 'ACTIVE',
  FAILED = 'FAILED',
  GRADUATED = 'GRADUATED',
}

export enum PoolType {
  BONDING_CURVE = 'BONDING_CURVE',
  RAYDIUM = 'RAYDIUM',
  METEORA_DBC = 'METEORA_DBC',
  METEORA_DAMM_V2 = 'METEORA_DAMM_V2',
}

// ── Phase 2 token-economy enums (mirror prisma/schema.prisma §a.1) ──
export enum TokenProgram {
  TOKEN_CLASSIC = 'TOKEN_CLASSIC',
  TOKEN_2022 = 'TOKEN_2022',
}

export enum FundraiseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  THRESHOLD_MET = 'THRESHOLD_MET',
  FINALIZING = 'FINALIZING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum FeeSource {
  IN_APP = 'IN_APP',
  EXTERNAL = 'EXTERNAL',
}

export enum TradeSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum FeeEventType {
  TRANSFER_FEE_WITHHELD = 'TRANSFER_FEE_WITHHELD',
  PARTNER_TRADING_FEE = 'PARTNER_TRADING_FEE',
  CREATOR_TRADING_FEE = 'CREATOR_TRADING_FEE',
  LOCKED_LP_FEE = 'LOCKED_LP_FEE',
  SURPLUS = 'SURPLUS',
  REBATE = 'REBATE',
  CLAIMED = 'CLAIMED',
}

export enum FeeRecipient {
  PLATFORM = 'PLATFORM',
  CREATOR = 'CREATOR',
  PROTOCOL = 'PROTOCOL',
  TRADER = 'TRADER',
}

export enum LpProvider {
  METEORA_DAMM_V2 = 'METEORA_DAMM_V2',
  METEORA_DAMM_V1 = 'METEORA_DAMM_V1',
  METEORA_DLMM = 'METEORA_DLMM',
}

export enum LpOwner {
  PARTNER = 'PARTNER',
  CREATOR = 'CREATOR',
}

export enum VestingProvider {
  STREAMFLOW = 'STREAMFLOW',
  JUP_LOCK = 'JUP_LOCK',
}

export enum VestingStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
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

export interface CreatorToken {
  id: string;
  userId: string;
  chain: ChainType;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  mintAddress?: string;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  poolAddress?: string;
  poolType?: PoolType;
  bondingCurveParams?: {
    slope: number;
    basePrice: number;
    reserveRatio: number;
  };
  status: TokenStatus;
  deployTxSignature?: string;
  deployedAt?: string;
  graduatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Phase 2 token-economy interfaces (mirror prisma/schema.prisma §a.4–a.10) ──
// Money / on-chain amounts are base-unit strings for precision; USD/display = number.

export interface TokenFeeConfig {
  id: string;
  tokenId: string;
  transferFeeBps: number;
  rebateTargetBps: number;
  creatorTradingFeeBps: number;
  partnerTradingFeeBps: number;
  protocolFeeBps: number;
  feeClaimer?: string;
  creatorFeeWallet?: string;
  rebateWallet?: string;
  withdrawWithheldAuthority?: string;
  rebateMint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  tokenId: string;
  userId?: string;
  traderWallet: string;
  side: TradeSide;
  source: FeeSource;
  venue: PoolType;
  intentId?: string;
  signature?: string;
  amountInBaseUnits: string;
  amountInMint: string;
  amountOutBaseUnits: string;
  amountOutMint: string;
  priceUsd?: number;
  priceTs?: string;
  transferFeeBaseUnits: string;
  feeBps?: number;
  rebateBaseUnits: string;
  rebateMint?: string;
  rebatePaid: boolean;
  rebateSignature?: string;
  poolAddress?: string;
  blockTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeeEvent {
  id: string;
  tokenId: string;
  tradeId?: string;
  type: FeeEventType;
  source: FeeSource;
  recipient: FeeRecipient;
  recipientWallet?: string;
  grossBaseUnits: string;
  feeBaseUnits: string;
  netBaseUnits: string;
  amountMint: string;
  amountUsd?: number;
  feeBps?: number;
  signature?: string;
  internalRef?: string;
  claimed: boolean;
  claimedAt?: string;
  claimSignature?: string;
  blockTime?: string;
  createdAt: string;
}

export interface TokenFundraise {
  id: string;
  tokenId: string;
  status: FundraiseStatus;
  quoteMint: string;
  thresholdBaseUnits: string;
  raisedBaseUnits: string;
  contributorCount: number;
  minContributionBaseUnits?: string;
  maxContributionBaseUnits?: string;
  partnerLpBps?: number;
  creatorLpBps?: number;
  partnerLockedLpBps?: number;
  creatorLockedLpBps?: number;
  migrationFeeBps?: number;
  leftoverReceiver?: string;
  startsAt?: string;
  endsAt?: string;
  finalizedAt?: string;
  finalizeSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FundraiseContribution {
  id: string;
  fundraiseId: string;
  tokenId: string;
  userId?: string;
  walletAddress: string;
  amountBaseUnits: string;
  quoteMint: string;
  signature: string;
  refunded: boolean;
  refundSignature?: string;
  blockTime?: string;
  createdAt: string;
}

export interface LpPosition {
  id: string;
  tokenId: string;
  provider: LpProvider;
  owner: LpOwner;
  ownerWallet: string;
  poolAddress: string;
  positionAddress?: string;
  positionNftMint?: string;
  lpMint?: string;
  baseReserveBaseUnits?: string;
  quoteReserveBaseUnits?: string;
  liquidity?: string;
  locked: boolean;
  lockedUntil?: string;
  createSignature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VestingSchedule {
  id: string;
  tokenId: string;
  beneficiaryUserId?: string;
  beneficiaryWallet: string;
  provider: VestingProvider;
  streamId?: string;
  totalBaseUnits: string;
  releasedBaseUnits: string;
  tokenMint: string;
  cliffSeconds: number;
  durationSeconds: number;
  startAt: string;
  cliffAt?: string;
  endAt?: string;
  status: VestingStatus;
  createSignature?: string;
  cancelSignature?: string;
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
  chain: ChainType;
  nativeBalance: number;
  nativePriceUsd?: number;
  nativeSymbol: string;
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
  native: number; // native token value usd
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
  chain: ChainType;
}

// Swap types
export interface SwapQuote {
  chain: ChainType;
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

// Leaderboard types
export interface CreatorLeaderboardEntry {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  tokenSymbol?: string;
  followerCount: number;
  postCount: number;
  topPostLikeCount: number;
}

export interface CreatorLeaderboardResponse {
  trending: CreatorLeaderboardEntry[];
  mostActive: CreatorLeaderboardEntry[];
}

// API Response types
export interface FeedResponse {
  posts: PostWithCreator[];
  nextCursor?: string;
  page?: number;
  hasMore: boolean;
  sort?: string;
  /** 'fast' = global recent (phase 1), 'geo' = distance-sorted (phase 2) */
  phase?: 'fast' | 'geo';
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
