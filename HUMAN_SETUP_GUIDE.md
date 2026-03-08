# Momento - Human Setup & Intervention Guide

Everything in this document requires a **human** to complete. An AI agent cannot create accounts, accept terms of service, provide payment details, or access external dashboards on your behalf.

---

## Table of Contents

1. [Apple Developer Program](#1-apple-developer-program)
2. [Google Play Console](#2-google-play-console)
3. [Supabase (Database + Storage)](#3-supabase-database--storage)
4. [Privy (Auth + Embedded Wallets)](#4-privy-auth--embedded-wallets)
5. [Upstash Redis (Caching)](#5-upstash-redis-caching)
6. [Veriff (KYC Identity Verification)](#6-veriff-kyc-identity-verification)
7. [Helius (Solana RPC + Token Data)](#7-helius-solana-rpc--token-data)
8. [Expo / EAS (Mobile Builds)](#8-expo--eas-mobile-builds)
9. [Vercel (API + Landing Hosting)](#9-vercel-api--landing-hosting)
10. [Expo Push Notifications](#10-expo-push-notifications)
11. [Domain & DNS](#11-domain--dns)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Post-Setup Verification Checklist](#13-post-setup-verification-checklist)

---

## 1. Apple Developer Program

**Why:** Required to build iOS apps, use push notifications, and submit to the App Store.

| Item | Detail |
|------|--------|
| URL | https://developer.apple.com/programs/ |
| Cost | $99/year |
| Human required | Identity verification, legal agreement, payment |

### Steps
1. Enroll in the Apple Developer Program (requires Apple ID)
2. Wait for enrollment approval (can take 24-48 hours)
3. Create an **App ID** with these capabilities:
   - Push Notifications
   - Sign In with Apple (used by Privy for Apple login)
4. Record these values:
   - **Team ID** (Account > Membership > Team ID)
   - **Bundle ID**: `com.momento.app` (must match `apps/mobile/app.json` → `ios.bundleIdentifier`)

### Where these are used
- `apps/mobile/app.json:27` — `ios.bundleIdentifier: "com.momento.app"`
- `apps/mobile/eas.json:43-45` — `appleId`, `ascAppId`, `appleTeamId` for App Store submission

### Agent cannot do this because
- Requires identity verification, legal agreements, and payment

---

## 2. Google Play Console

**Why:** Required to publish the Android app to the Play Store.

| Item | Detail |
|------|--------|
| URL | https://play.google.com/console |
| Cost | $25 one-time |
| Human required | Identity verification, payment, app creation |

### Steps
1. Create a Google Play Developer account
2. Create a new application
3. Generate a **Google Services JSON** (service account key for EAS submissions)
4. Record:
   - **Package name**: `com.momento.app` (must match `apps/mobile/app.json` → `android.package`)

### Where these are used
- `apps/mobile/app.json:32` — `android.package: "com.momento.app"`
- `apps/mobile/eas.json:48` — `serviceAccountKeyPath: "./google-services.json"` for Play Store upload

### Agent cannot do this because
- Requires Google account, identity verification, and payment

---

## 3. Supabase (Database + Storage)

**Why:** PostgreSQL database (via Prisma) and object storage for user uploads (avatars, banners, post media).

| Item | Detail |
|------|--------|
| URL | https://supabase.com |
| Cost | Free tier available; Pro from $25/mo |
| Human required | Account creation, project setup, storage bucket configuration |

### Steps
1. Create a Supabase account and new project
2. Choose region closest to your users
3. **Enable PostGIS extension** (required for location-based queries):
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
4. Create a **storage bucket** named `momento-uploads` (set to **public**)
   - This is the bucket name hardcoded in `apps/api/lib/storage.ts:9`
5. Collect credentials from **Project Settings > API**:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (keep secret!)
6. Collect credentials from **Project Settings > Database**:
   - `DATABASE_URL` — Connection string (Transaction/PgBouncer mode)
   - `DIRECT_URL` — Direct connection string (used by Prisma migrations)

### Where these are used
- `apps/api/prisma/schema.prisma:6-8` — `DATABASE_URL` and `DIRECT_URL` for Prisma ORM
- `apps/api/lib/storage.ts:4-6` — Supabase client for presigned file uploads
- `apps/api/app/api/uploads/presign/route.ts` — Upload endpoint that generates presigned URLs

### Additional setup
- The storage bucket **must be public** for generated `publicUrl` values to work
- RLS (Row Level Security) can be configured on the bucket but the API uses the `service_role` key which bypasses RLS

### Agent cannot do this because
- Requires account creation with email verification
- PostGIS must be enabled via the Supabase SQL editor dashboard
- Storage buckets must be created via the Supabase dashboard

---

## 4. Privy (Auth + Embedded Wallets)

**Why:** Handles all user authentication (Google/Apple login) and creates embedded Solana wallets for each user automatically.

| Item | Detail |
|------|--------|
| URL | https://privy.io |
| Cost | Free tier available |
| Human required | Account creation, app configuration, OAuth provider setup |

### Steps
1. Create a Privy account
2. Create a new Privy app
3. Configure the app in the Privy dashboard:
   - **Login Methods**: Enable Google and Apple
   - **Embedded Wallets**: Enable **Solana** wallets (this is critical — every user gets a Solana wallet on signup)
   - **Allowed Domains/Origins**: Add your API domain (e.g., `https://api.momento.app`) and mobile deep link scheme (`momento://`)
4. Collect credentials:
   - `NEXT_PUBLIC_PRIVY_APP_ID` — App ID (from Dashboard)
   - `PRIVY_APP_SECRET` — App Secret (from API Settings)

### Where these are used
- **Server-side**: `apps/api/lib/auth.ts:5-8` — `PrivyClient` verifies JWT tokens from mobile app, fetches user wallet addresses
- **Mobile**: `apps/mobile/app/_layout.tsx:21` — `PrivyProvider` wraps the entire app
- **Mobile**: `apps/mobile/app/login.tsx:12` — `usePrivy().login()` triggers OAuth flows
- **Mobile**: `apps/mobile/src/providers/AuthBridge.tsx` — Bridges Privy access tokens into the API service

### Critical configuration
- **Apple Sign In** requires your Apple Developer Team ID and App ID to be configured in Privy dashboard
- **Google Sign In** requires a Google OAuth client ID configured in Privy dashboard
- The mobile app uses `@privy-io/expo` SDK (`apps/mobile/package.json:14`) which requires the deep link scheme `momento://` (set in `apps/mobile/app.json:7`)

### Agent cannot do this because
- Requires account signup, OAuth provider linking (Google Cloud Console, Apple Developer portal), and dashboard configuration

---

## 5. Upstash Redis (Caching)

**Why:** Serverless Redis used for caching API responses (feed, profiles, wallet balances). The API is deployed on Vercel (serverless), so a traditional Redis instance won't work — Upstash provides HTTP-based Redis.

| Item | Detail |
|------|--------|
| URL | https://upstash.com |
| Cost | Free tier: 10K commands/day |
| Human required | Account creation, database provisioning |

### Steps
1. Create an Upstash account
2. Create a new Redis database
3. Choose the region closest to your Vercel deployment (the API uses `iad1` / US East — see `apps/api/vercel.json:6`)
4. Collect credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Where these are used
- `apps/api/lib/redis.ts:3-5` — Redis client initialization
- Every API route uses `getOrSetCache()` for response caching with TTLs (30s to 5min)
- Cache invalidation runs on mutations (new posts, likes, follows, KYC decisions)

### Agent cannot do this because
- Requires account creation and selecting a region/plan

---

## 6. Veriff (KYC Identity Verification)

**Why:** Creators must pass identity verification (KYC) before they can post content and create tokens. Veriff handles ID document scanning and selfie matching.

| Item | Detail |
|------|--------|
| URL | https://veriff.com |
| Cost | Pay-per-verification; requires sales contact for API access |
| Human required | Account creation, **sales contact**, webhook configuration |

### Steps
1. Create a Veriff account
2. **Contact Veriff sales** to get API access (self-service may not be available)
3. Collect credentials:
   - `VERIFF_API_KEY` — API key for creating verification sessions
   - `VERIFF_SHARED_SECRET` — HMAC secret for webhook signature verification
4. **Configure webhook URL** in Veriff dashboard:
   - URL: `https://<your-api-domain>/api/kyc/webhook`
   - Events: Decision webhooks (approved/declined)
   - The webhook handler is at `apps/api/app/api/kyc/webhook/route.ts`

### Where these are used
- `apps/api/lib/veriff.ts:4-6` — API key and shared secret
- `apps/api/lib/veriff.ts:29` — Webhook callback URL uses `NEXT_PUBLIC_API_URL`
- `apps/api/app/api/creators/apply/route.ts` — Creates Veriff sessions when users apply to become creators
- `apps/api/app/api/kyc/webhook/route.ts` — Receives Veriff decisions, updates user role to CREATOR if approved

### Dev bypass
- Set `SKIP_KYC=true` in `.env.local` to skip Veriff entirely during development
- This auto-approves all creator applications (see `apps/api/app/api/creators/apply/route.ts:47`)

### Agent cannot do this because
- Requires contacting sales team, signing a contract, and configuring webhooks in a dashboard

---

## 7. Helius (Solana RPC + Token Data)

**Why:** Provides Solana blockchain access — wallet balances, token metadata, and SOL price data. Used instead of the public Solana RPC for reliability and the DAS API for token data.

| Item | Detail |
|------|--------|
| URL | https://helius.dev |
| Cost | Free tier: 100K credits/month |
| Human required | Account creation, API key generation |

### Steps
1. Create a Helius account
2. Generate an API key
3. Collect: `HELIUS_API_KEY`

### Where these are used
- `apps/api/lib/helius.ts:3-5` — Constructs RPC URL (`mainnet.helius-rpc.com`) and API URL
- `apps/api/lib/helius.ts:12-30` — `getSolBalance()` — fetches SOL balance via JSON-RPC
- `apps/api/lib/helius.ts:35-84` — `getTokenBalances()` — fetches all fungible token holdings via DAS `searchAssets`
- `apps/api/lib/helius.ts:89-128` — `fetchWalletBalance()` — complete wallet overview with USD values
- `apps/api/app/api/wallet/balance/route.ts` — Wallet balance API endpoint

### Network note
- The API currently uses **mainnet** (`mainnet.helius-rpc.com`) — see `apps/api/lib/helius.ts:4`
- The mobile EAS config has devnet/mainnet split per build profile (`apps/mobile/eas.json`)
- For development, you may want a separate devnet Helius key

### Agent cannot do this because
- Requires account creation and agreeing to terms of service

---

## 8. Expo / EAS (Mobile Builds)

**Why:** Expo Application Services (EAS) handles building iOS/Android binaries and submitting to app stores. The mobile app is built with Expo SDK 52.

| Item | Detail |
|------|--------|
| URL | https://expo.dev |
| Cost | Free tier: 30 builds/month |
| Human required | Account creation, project linking, build profile configuration |

### Steps
1. Create an Expo account at https://expo.dev
2. Install the EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. Initialize the project:
   ```bash
   cd apps/mobile
   eas init
   ```
4. This generates a `projectId` — update `eas.json` accordingly
5. The EAS project ID is also needed as `EXPO_PUBLIC_PROJECT_ID` for push notifications (used in `NotificationProvider.tsx:77`)

### Where these are used
- `apps/mobile/eas.json` — Build profiles (development, preview, production) with per-environment variables
- `apps/mobile/app.json` — Expo app config (name, scheme, permissions, icons)
- `apps/mobile/src/providers/NotificationProvider.tsx:76-77` — EAS project ID for push token registration

### Build profiles (from `eas.json`)
| Profile | API URL | Solana Network | Distribution |
|---------|---------|---------------|-------------|
| development | localhost:3001 | devnet | internal (simulator) |
| preview | staging-api.momento.app | devnet | internal |
| production | api.momento.app | mainnet-beta | app stores |

### App Store submission config
The `eas.json` submit section has **PLACEHOLDERs** that must be filled in:
- `appleId`: Your Apple Developer email
- `ascAppId`: App Store Connect App ID (created when you register the app)
- `appleTeamId`: Your Apple Developer Team ID
- `serviceAccountKeyPath`: Path to `google-services.json` for Play Store

### Agent cannot do this because
- Requires interactive CLI login, Expo account, and linking to app store accounts

---

## 9. Vercel (API + Landing Hosting)

**Why:** Both the Next.js API (`apps/api`) and the landing page (`apps/landing`) are deployed to Vercel as serverless functions.

| Item | Detail |
|------|--------|
| URL | https://vercel.com |
| Cost | Free tier available; Pro from $20/mo |
| Human required | Account creation, project linking, environment variable configuration |

### Steps
1. Create a Vercel account
2. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   vercel login
   ```
3. Link projects:
   ```bash
   cd apps/api && vercel link
   cd apps/landing && vercel link
   ```
4. Configure environment variables in the Vercel dashboard for the API project:
   - All variables from the [Environment Variables Reference](#12-environment-variables-reference) below
5. Configure custom domains (see [Domain & DNS](#11-domain--dns))

### Where these are used
- `apps/api/vercel.json` — API deployment config: region `iad1`, CORS headers for `/api/*`, Prisma generate in build command
- `apps/landing/vercel.json` — Landing page deployment config: security headers, static asset caching

### Important
- The API `vercel.json` sets `Access-Control-Allow-Origin: *` — you should restrict this to your actual domains in production
- The build command is `prisma generate && next build` — Prisma client is generated at build time
- Region is `iad1` (US East) — match your Upstash Redis region to this

### Agent cannot do this because
- Requires interactive CLI login, project linking, and dashboard configuration for environment variables and domains

---

## 10. Expo Push Notifications

**Why:** The app sends push notifications for new posts, comments, and creator application decisions via Expo's push notification service.

| Item | Detail |
|------|--------|
| URL | https://expo.dev (uses Expo's push service — no separate account needed) |
| Cost | Free (included with Expo) |
| Human required | Apple Push Notification setup, FCM setup |

### Steps
1. **iOS (APNs)**: Generate an APNs key in the Apple Developer portal
   - Go to Certificates, Identifiers & Profiles > Keys > Create Key
   - Enable "Apple Push Notifications service (APNs)"
   - Download the `.p8` key file
   - Upload it to Expo via `eas credentials` or the Expo dashboard
2. **Android (FCM)**: Set up Firebase Cloud Messaging
   - Create a Firebase project at https://console.firebase.google.com
   - Add your Android app with package `com.momento.app`
   - Download `google-services.json`
   - Upload FCM server key to Expo

### Where these are used
- `apps/api/lib/notifications.ts` — Server sends push notifications via `https://exp.host/--/api/v2/push/send`
- `apps/mobile/src/providers/NotificationProvider.tsx` — Registers for push tokens, listens for notifications
- Notifications are triggered by:
  - New post by a followed creator (`notifyNewPost`)
  - New comment on your post (`notifyNewComment`)
  - Creator application decision (`notifyCreatorApproval`)

### Agent cannot do this because
- Requires Apple Developer portal access for APNs key
- Requires Firebase console access for FCM setup
- Requires uploading credentials to Expo

---

## 11. Domain & DNS

**Why:** Production deployment needs custom domains for the API and landing page.

| Item | Detail |
|------|--------|
| Human required | Domain purchase, DNS configuration |

### Expected domains (from `eas.json`)
- `api.momento.app` — API (Vercel)
- `staging-api.momento.app` — Staging API (Vercel)
- `momento.app` or `www.momento.app` — Landing page (Vercel)

### Steps
1. Purchase domain
2. In Vercel, add custom domains to each project
3. Configure DNS records as Vercel instructs (CNAME or A records)
4. Update `NEXT_PUBLIC_API_URL` in Vercel environment variables to match

### Agent cannot do this because
- Requires domain registrar account and DNS configuration access

---

## 12. Environment Variables Reference

### API (`apps/api/.env.local`)

| Variable | Source | Used In | Required |
|----------|--------|---------|----------|
| `DATABASE_URL` | Supabase > Settings > Database | `prisma/schema.prisma` | Yes |
| `DIRECT_URL` | Supabase > Settings > Database | `prisma/schema.prisma` | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy Dashboard | `lib/auth.ts` | Yes |
| `PRIVY_APP_SECRET` | Privy > API Settings | `lib/auth.ts` | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Dashboard | `lib/redis.ts` | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Dashboard | `lib/redis.ts` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API | `lib/storage.ts` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API | `lib/storage.ts` | Yes |
| `HELIUS_API_KEY` | Helius Dashboard | `lib/helius.ts` | Yes |
| `VERIFF_API_KEY` | Veriff Dashboard | `lib/veriff.ts` | No (if SKIP_KYC=true) |
| `VERIFF_SHARED_SECRET` | Veriff Dashboard | `lib/veriff.ts` | No (if SKIP_KYC=true) |
| `NEXT_PUBLIC_API_URL` | Your deployment URL | `lib/veriff.ts` (webhook callback) | Yes |
| `SKIP_KYC` | Set to `"true"` for dev | `app/api/creators/apply/route.ts` | No (dev only) |

### Mobile (`apps/mobile` — set via EAS build profiles or `.env`)

| Variable | Source | Used In | Required |
|----------|--------|---------|----------|
| `EXPO_PUBLIC_API_URL` | Your API deployment URL | `src/config/env.ts` | Yes |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Privy Dashboard (same as above) | `src/config/env.ts` | Yes |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Helius or public Solana RPC | `src/config/env.ts` | Yes |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | `src/config/env.ts` | Yes |
| `EXPO_PUBLIC_PROJECT_ID` | Expo/EAS project ID | Push notification registration | Yes |

---

## 13. Post-Setup Verification Checklist

Complete each item before starting development:

### Accounts Created
- [ ] Apple Developer Program enrolled and approved
- [ ] Google Play Console account created
- [ ] Supabase project created
- [ ] Privy app created
- [ ] Upstash Redis database created
- [ ] Veriff account with API access (or plan to use SKIP_KYC=true for dev)
- [ ] Helius account created
- [ ] Expo/EAS account created
- [ ] Vercel account created

### Supabase Configuration
- [ ] PostGIS extension enabled
- [ ] Storage bucket `momento-uploads` created and set to public
- [ ] Database connection strings collected (Transaction + Direct)

### Privy Configuration
- [ ] Google login method enabled
- [ ] Apple login method enabled
- [ ] Solana embedded wallets enabled
- [ ] Deep link scheme `momento://` added to allowed origins
- [ ] App ID and secret collected

### Veriff Configuration (skip for dev with SKIP_KYC=true)
- [ ] API access granted by sales team
- [ ] Webhook URL configured: `https://<api-domain>/api/kyc/webhook`
- [ ] API key and shared secret collected

### EAS Configuration
- [ ] `eas init` run in `apps/mobile/`
- [ ] `eas.json` placeholders replaced:
  - [ ] `appleId` — your Apple Developer email
  - [ ] `ascAppId` — App Store Connect App ID
  - [ ] `appleTeamId` — Apple Developer Team ID
  - [ ] `google-services.json` file placed in `apps/mobile/`

### Push Notification Credentials
- [ ] APNs key (`.p8`) generated and uploaded to Expo
- [ ] Firebase project created, FCM key uploaded to Expo

### Vercel Deployment
- [ ] `apps/api` linked to Vercel project
- [ ] `apps/landing` linked to Vercel project
- [ ] All API environment variables set in Vercel dashboard
- [ ] Custom domains configured

### Environment Files
- [ ] `apps/api/.env.local` created with all required variables
- [ ] Mobile env vars set in `eas.json` build profiles (or local `.env`)

### Verification Commands
After setup, run these to verify:
```bash
# Install dependencies
pnpm install

# Generate Prisma client and push schema
cd apps/api
pnpm db:generate
pnpm db:push

# Start API locally
pnpm dev

# In another terminal, start mobile
cd apps/mobile
pnpm dev
```
