# Momento - Cursor Instructions (Part 1)
# Monorepo Setup, Database & Core Libraries

---

# Phase 1: Monorepo Setup

## P1-01: Initialize GitHub Repository

```
Create a new GitHub repository named "momento"
Clone it locally
Initialize with a README
```

---

## P1-02: Create Turbo Monorepo Structure

```
Initialize a Turbo monorepo with the following structure:

momento/
├── apps/
│   ├── api/           # Next.js API
│   └── mobile/        # Expo React Native
├── packages/
│   └── shared/        # Shared TypeScript types
├── package.json
├── turbo.json
└── pnpm-workspace.yaml

Root package.json:
{
  "name": "momento",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}

pnpm-workspace.yaml:
packages:
  - "apps/*"
  - "packages/*"

turbo.json:
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] }
  }
}
```

---

## P1-03: Create Shared Package

```
Create packages/shared/package.json:
{
  "name": "@momento/shared",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/"
  }
}

Create packages/shared/tsconfig.json:
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}

Create packages/shared/src/index.ts:
export * from './types';
export * from './constants';
```

---

## P1-04: Create Shared Types

```
Create packages/shared/src/types.ts:

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
  postCount: number;
  distanceMeters?: number;
}

// Post types
export interface Post {
  id: string;
  creatorId: string;
  postType: PostType;
  content?: string;
  caption?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
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
  // Dummy for Phase 1
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
}

export interface WalletBalance {
  solBalance: number;
  tokens: TokenHolding[];
  // Dummy for Phase 1
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
}

export interface FollowResponse {
  following: boolean;
  followerCount: number;
}

export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}
```

---

## P1-05: Create Shared Constants

```
Create packages/shared/src/constants.ts:

export const SOCIAL_PLATFORMS = {
  youtube: { icon: 'logo-youtube', color: '#FF0000', urlPrefix: 'https://youtube.com/' },
  instagram: { icon: 'logo-instagram', color: '#E4405F', urlPrefix: 'https://instagram.com/' },
  twitter: { icon: 'logo-twitter', color: '#1DA1F2', urlPrefix: 'https://twitter.com/' },
  spotify: { icon: 'musical-notes', color: '#1DB954', urlPrefix: 'https://open.spotify.com/' },
  soundcloud: { icon: 'cloud', color: '#FF5500', urlPrefix: 'https://soundcloud.com/' },
  tiktok: { icon: 'musical-note', color: '#000000', urlPrefix: 'https://tiktok.com/@' },
  website: { icon: 'globe', color: '#8A8A8A', urlPrefix: '' },
} as const;

// Dummy data for Phase 1 tickers
export const DUMMY_TRENDING_TOKENS = [
  { symbol: 'DEEL', change: 12.5 },
  { symbol: 'BELLE', change: -3.2 },
  { symbol: 'NAAN', change: 8.7 },
  { symbol: 'AURA', change: 24.1 },
  { symbol: 'SEAM', change: -1.5 },
];

export const DUMMY_CREATORS_TO_WATCH = [
  { symbol: 'TASH', change: 45.2 },
  { symbol: 'TEAH', change: 18.9 },
  { symbol: 'TWSH', change: 7.3 },
  { symbol: 'CHCTS', change: -2.1 },
];
```

---

## P1-06: Create Next.js API App

```
Create apps/api using Next.js 14 with App Router:

cd apps
npx create-next-app@latest api --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"

Update apps/api/package.json to add dependencies:
{
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "@privy-io/server-auth": "^1.0.0",
    "@upstash/redis": "^1.28.0",
    "@supabase/supabase-js": "^2.39.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@momento/shared": "workspace:*",
    "prisma": "^5.0.0",
    "@types/uuid": "^9.0.0"
  }
}

Create apps/api/.env.local with all environment variables from SETUP_GUIDE.md
```

---

## P1-07: Create Expo Mobile App

```
Create apps/mobile using Expo:

cd apps
npx create-expo-app mobile --template tabs

Update apps/mobile/package.json:
{
  "dependencies": {
    "@momento/shared": "workspace:*",
    "@privy-io/expo": "^0.25.0",
    "@tanstack/react-query": "^5.0.0",
    "@shopify/flash-list": "1.6.4",
    "expo-image": "~1.12.0",
    "expo-location": "~17.0.0",
    "expo-notifications": "~0.28.0",
    "expo-av": "~14.0.0",
    "expo-image-picker": "~15.0.0",
    "react-native-reanimated": "~3.10.0",
    "react-native-gesture-handler": "~2.16.0",
    "react-native-svg": "15.2.0"
  }
}

Install dependencies:
cd apps/mobile
npx expo install expo-image expo-location expo-notifications expo-av expo-image-picker react-native-reanimated react-native-gesture-handler react-native-svg @shopify/flash-list
npm install @privy-io/expo @tanstack/react-query

Create apps/mobile/.env:
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

---

## P1-08: Configure EAS Build

```
Create apps/mobile/eas.json:
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "http://localhost:3000",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api.vercel.app",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api.vercel.app",
        "EXPO_PUBLIC_PRIVY_APP_ID": "your-privy-app-id"
      }
    }
  },
  "submit": {
    "production": {}
  }
}

Run: cd apps/mobile && eas build:configure
```

---

## P1-09: Create Development Build

```
Create a development build for testing on device:

cd apps/mobile
eas build --profile development --platform ios
# or
eas build --profile development --platform android

This creates a development client you can install on your device.
```

---

# Phase 2: Database Schema

## P2-01: Create Prisma Schema

```
Create apps/api/prisma/schema.prisma:

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum UserRole {
  USER
  CREATOR
}

enum KycStatus {
  NONE
  PENDING
  VERIFIED
  REJECTED
}

enum PostType {
  TEXT
  IMAGE
  VIDEO
}

model User {
  id              String    @id @default(uuid())
  privyUserId     String    @unique
  walletAddress   String    @unique
  email           String?
  username        String?   @unique
  displayName     String?
  bio             String?
  avatarUrl       String?
  bannerUrl       String?
  role            UserRole  @default(USER)
  kycStatus       KycStatus @default(NONE)
  isAdminApproved Boolean   @default(false)
  isAdmin         Boolean   @default(false)
  tokenSymbol     String?
  socialLinks     Json?
  locationLat     Float?
  locationLng     Float?
  pushToken       String?

  // Denormalized counts
  followerCount  Int @default(0)
  followingCount Int @default(0)
  postCount      Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  posts         Post[]
  likes         Like[]
  comments      Comment[]
  followers     Follow[]    @relation("Following")
  following     Follow[]    @relation("Follower")
  kycRecords    KycRecord[]

  @@index([locationLat, locationLng])
  @@index([role, isAdminApproved])
}

model Post {
  id        String   @id @default(uuid())
  creatorId String
  postType  PostType
  content   String?
  caption   String?
  mediaUrl  String?
  mediaUrls Json?
  latitude  Float
  longitude Float

  // Denormalized counts
  likeCount    Int @default(0)
  commentCount Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  creator  User      @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  likes    Like[]
  comments Comment[]

  @@index([creatorId])
  @@index([latitude, longitude])
  @@index([createdAt])
}

model Like {
  id        String   @id @default(uuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
}

model Comment {
  id        String   @id @default(uuid())
  userId    String
  postId    String
  content   String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId, createdAt])
}

model Follow {
  id          String   @id @default(uuid())
  followerId  String
  followingId String
  createdAt   DateTime @default(now())

  follower  User @relation("Follower", fields: [followerId], references: [id], onDelete: Cascade)
  following User @relation("Following", fields: [followingId], references: [id], onDelete: Cascade)

  @@unique([followerId, followingId])
}

model KycRecord {
  id              String    @id @default(uuid())
  userId          String
  veriffSessionId String    @unique
  status          KycStatus @default(PENDING)
  veriffDecision  Json?
  veriffPerson    Json?
  createdAt       DateTime  @default(now())
  decidedAt       DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

---

## P2-02: Create PostGIS Migration

```
Create apps/api/prisma/migrations/00_postgis_setup/migration.sql:

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- Add geography column to Post
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS user_location_idx ON "User" USING GIST (location);
CREATE INDEX IF NOT EXISTS post_location_idx ON "Post" USING GIST (location);

-- Trigger to sync User lat/lng to geography
CREATE OR REPLACE FUNCTION sync_user_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."locationLat" IS NOT NULL AND NEW."locationLng" IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW."locationLng", NEW."locationLat"), 4326)::geography;
  ELSE
    NEW.location = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_location_sync ON "User";
CREATE TRIGGER user_location_sync
  BEFORE INSERT OR UPDATE OF "locationLat", "locationLng" ON "User"
  FOR EACH ROW EXECUTE FUNCTION sync_user_location();

-- Trigger to sync Post lat/lng to geography
CREATE OR REPLACE FUNCTION sync_post_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  ELSE
    NEW.location = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_location_sync ON "Post";
CREATE TRIGGER post_location_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Post"
  FOR EACH ROW EXECUTE FUNCTION sync_post_location();
```

---

## P2-03: Run Database Migrations

```
Run these commands manually:

cd apps/api

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Run PostGIS migration in Supabase SQL Editor:
# Copy contents of prisma/migrations/00_postgis_setup/migration.sql
# Paste and run in Supabase Dashboard → SQL Editor
```

---

# Phase 3: Core Libraries

## P3-01: Create Prisma Client

```
Create apps/api/lib/prisma.ts:

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## P3-02: Create Redis Client

```
Create apps/api/lib/redis.ts:

import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache key generators
export const cacheKeys = {
  feed: (lat: number, lng: number, radius: number) => {
    // Round to ~1km grid for cache sharing
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLng = Math.round(lng * 100) / 100;
    return `feed:${roundedLat}:${roundedLng}:${radius}`;
  },
  post: (postId: string) => `post:${postId}`,
  creator: (creatorId: string) => `creator:${creatorId}`,
  creatorPosts: (creatorId: string) => `creator:${creatorId}:posts`,
  wallet: (walletAddress: string) => `wallet:${walletAddress}`,
  userLikes: (userId: string) => `user:${userId}:likes`,
};

// Cache TTLs in seconds
export const cacheTTL = {
  feed: 60,           // 1 minute
  post: 300,          // 5 minutes
  creator: 600,       // 10 minutes
  wallet: 30,         // 30 seconds
  userLikes: 300,     // 5 minutes
};

// Helper to get or set cache
export async function getOrSetCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await redis.setex(key, ttl, fresh);
  return fresh;
}

// Invalidate cache
export async function invalidateCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

---

## P3-03: Create Auth Library

```
Create apps/api/lib/auth.ts:

import { NextRequest } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from './prisma';
import { User, UserRole } from '@momento/shared';

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export async function getAuthUser(request: NextRequest): Promise<User | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const { userId: privyUserId } = await privy.verifyAuthToken(token);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { privyUserId },
    });

    if (!user) {
      // Get Privy user details
      const privyUser = await privy.getUser(privyUserId);
      const wallet = privyUser.wallet?.address || '';
      const email = privyUser.email?.address;

      user = await prisma.user.create({
        data: {
          privyUserId,
          walletAddress: wallet,
          email,
        },
      });
    }

    return user as User;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function requireAuth(request: NextRequest): Promise<User> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireCreator(request: NextRequest): Promise<User> {
  const user = await requireAuth(request);
  if (user.role !== UserRole.CREATOR || !user.isAdminApproved) {
    throw new Error('Creator access required');
  }
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<User> {
  const user = await requireAuth(request);
  if (!user.isAdmin) {
    throw new Error('Admin access required');
  }
  return user;
}
```

---

## P3-04: Create Helius Library

```
Create apps/api/lib/helius.ts:

import { TokenHolding, WalletBalance } from '@momento/shared';

const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

interface HeliusBalance {
  mint: string;
  amount: number;
  decimals: number;
}

interface HeliusTokenMetadata {
  mint: string;
  onChainMetadata?: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
  };
  offChainMetadata?: {
    metadata?: {
      name?: string;
      symbol?: string;
      image?: string;
    };
  };
}

export async function getWalletBalance(walletAddress: string): Promise<WalletBalance> {
  try {
    // Get SOL balance
    const solResponse = await fetch(HELIUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress],
      }),
    });
    const solData = await solResponse.json();
    const solBalance = (solData.result?.value || 0) / 1e9;

    // Get token balances
    const tokenResponse = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${process.env.HELIUS_API_KEY}`
    );
    const tokenData: { tokens: HeliusBalance[] } = await tokenResponse.json();

    // Get token metadata
    const mints = tokenData.tokens?.map((t) => t.mint) || [];
    let metadata: HeliusTokenMetadata[] = [];

    if (mints.length > 0) {
      const metadataResponse = await fetch(
        `https://api.helius.xyz/v0/token-metadata?api-key=${process.env.HELIUS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mintAccounts: mints }),
        }
      );
      metadata = await metadataResponse.json();
    }

    // Combine balances with metadata
    const tokens: TokenHolding[] = (tokenData.tokens || []).map((token) => {
      const meta = metadata.find((m) => m.mint === token.mint);
      const onChain = meta?.onChainMetadata?.metadata;
      const offChain = meta?.offChainMetadata?.metadata;

      return {
        mint: token.mint,
        symbol: offChain?.symbol || onChain?.symbol || 'UNKNOWN',
        name: offChain?.name || onChain?.name || 'Unknown Token',
        amount: token.amount / Math.pow(10, token.decimals),
        decimals: token.decimals,
        logoUrl: offChain?.image,
        // Dummy values for Phase 1
        priceUsd: Math.random() * 100,
        valueUsd: (token.amount / Math.pow(10, token.decimals)) * Math.random() * 100,
        change24h: (Math.random() - 0.4) * 50,
      };
    });

    return {
      solBalance,
      tokens,
      // Dummy values for Phase 1
      totalValueUsd: tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0) + solBalance * 150,
      change24h: (Math.random() - 0.4) * 20,
      earningsToDate: Math.random() * 5000,
    };
  } catch (error) {
    console.error('Helius error:', error);
    return {
      solBalance: 0,
      tokens: [],
      totalValueUsd: 0,
      change24h: 0,
      earningsToDate: 0,
    };
  }
}
```

---

## P3-05: Create Veriff Library

```
Create apps/api/lib/veriff.ts:

import crypto from 'crypto';
import { KycStatus } from '@momento/shared';

const VERIFF_API_URL = 'https://stationapi.veriff.com/v1';

interface VeriffSession {
  id: string;
  url: string;
  status: string;
}

export async function createVeriffSession(
  userId: string,
  firstName?: string,
  lastName?: string
): Promise<{ sessionId: string; url: string }> {
  const response = await fetch(`${VERIFF_API_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-CLIENT': process.env.VERIFF_API_KEY!,
    },
    body: JSON.stringify({
      verification: {
        callback: `${process.env.NEXT_PUBLIC_API_URL}/api/kyc/webhook`,
        person: {
          firstName: firstName || 'User',
          lastName: lastName || userId.slice(0, 8),
        },
        vendorData: userId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create Veriff session');
  }

  const data: { verification: VeriffSession } = await response.json();

  return {
    sessionId: data.verification.id,
    url: data.verification.url,
  };
}

export function verifyVeriffWebhook(
  payload: string,
  signature: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.VERIFF_WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export function mapVeriffStatus(decision: string): KycStatus {
  switch (decision) {
    case 'approved':
      return KycStatus.VERIFIED;
    case 'declined':
    case 'expired':
    case 'abandoned':
      return KycStatus.REJECTED;
    default:
      return KycStatus.PENDING;
  }
}
```

---

## P3-06: Create Storage Library

```
Create apps/api/lib/storage.ts:

import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

type Folder = 'avatars' | 'banners' | 'posts';

export async function createPresignedUploadUrl(
  folder: Folder,
  contentType: string,
  userId: string
): Promise<{ uploadUrl: string; publicUrl: string; path: string }> {
  const extension = contentType.split('/')[1] || 'bin';
  const fileName = `${userId}/${uuid()}.${extension}`;
  const path = `${folder}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(folder)
    .createSignedUploadUrl(fileName);

  if (error || !data) {
    throw new Error(`Failed to create upload URL: ${error?.message}`);
  }

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${path}`;

  return {
    uploadUrl: data.signedUrl,
    publicUrl,
    path,
  };
}

export async function deleteFile(path: string): Promise<void> {
  const [folder, ...rest] = path.split('/');
  const filePath = rest.join('/');

  await supabase.storage.from(folder).remove([filePath]);
}
```

---

## P3-07: Create Notifications Library

```
Create apps/api/lib/notifications.ts:

import { prisma } from './prisma';

interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, any>;
}

async function sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('Push notification error:', error);
  }
}

export async function notifyFollowersOfNewPost(
  creatorId: string,
  postId: string,
  creatorName: string
): Promise<void> {
  const followers = await prisma.follow.findMany({
    where: { followingId: creatorId },
    include: {
      follower: { select: { pushToken: true } },
    },
  });

  const messages: ExpoPushMessage[] = followers
    .filter((f) => f.follower.pushToken)
    .map((f) => ({
      to: f.follower.pushToken!,
      title: 'New Post',
      body: `${creatorName} just posted something new!`,
      data: { type: 'new_post', postId },
    }));

  await sendPushNotifications(messages);
}

export async function notifyPostOwnerOfComment(
  postId: string,
  commenterId: string,
  commenterName: string
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      creator: { select: { id: true, pushToken: true } },
    },
  });

  if (!post || post.creator.id === commenterId || !post.creator.pushToken) return;

  await sendPushNotifications([
    {
      to: post.creator.pushToken,
      title: 'New Comment',
      body: `${commenterName} commented on your post`,
      data: { type: 'new_comment', postId },
    },
  ]);
}

export async function notifyCreatorApproved(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });

  if (!user?.pushToken) return;

  await sendPushNotifications([
    {
      to: user.pushToken,
      title: 'Congratulations! 🎉',
      body: 'Your creator application has been approved!',
      data: { type: 'creator_approved' },
    },
  ]);
}
```

---

## P3-08: Verify Setup

```
Test the setup:

cd apps/api
npm run dev

# Should start without errors on http://localhost:3000

cd apps/mobile
npm start

# Should show Expo dev menu
```

---

# Continue to Part 2...

Part 2 covers:
- Phase 4: Feed & Discovery API Routes
- Phase 5: Posts & Engagement API Routes
- Phase 6: User & KYC API Routes
