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
  tokens: TokenHolding[];
  totalValueUsd?: number;
  change24h?: number;
  earningsToDate?: number;
}

// API Response types
export interface FeedResponse {
  posts: PostWithCreator[];
  nextCursor?: string;
  hasMore: boolean;
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
