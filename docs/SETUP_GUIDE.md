# Momento - External Services Setup Guide

> **For humans who don't read documentation.** Every step is click-by-click. No step is assumed obvious.
>
> Last updated: 2026-03-13

---

## Table of Contents

1. [Overview: What You Need](#1-overview)
2. [Supabase (Database + File Storage)](#2-supabase)
3. [Privy (User Authentication + Wallets)](#3-privy)
4. [Upstash Redis (Caching)](#4-upstash-redis)
5. [Helius (Solana Blockchain RPC)](#5-helius)
6. [Veriff (KYC Identity Verification)](#6-veriff)
7. [Vercel (API + Landing Page Hosting)](#7-vercel)
8. [Expo / EAS (Mobile App Builds)](#8-expo--eas)
9. [Apple Developer Account (iOS App Store)](#9-apple-developer)
10. [Google Play + Firebase (Android)](#10-google-play--firebase)
11. [Domain & DNS](#11-domain--dns)
12. [Environment Variable Reference](#12-env-var-reference)
13. [Verification Checklist](#13-verification-checklist)

> **Note on lazy initialization:** All API lib modules (`redis.ts`, `auth.ts`, `storage.ts`, `helius.ts`, `veriff.ts`) use lazy initialization. They do not create service clients at import time, so the API server will start even if some env vars are missing. Errors only occur when a request actually needs a service whose credentials are not configured. This means you can set up services incrementally.

---

## 1. Overview

Momento uses lazy initialization for all service modules, so you can start developing with just a database and auth provider. Other services can be added incrementally.

### Minimum Viable Local Dev (must do first)
| # | Service | Purpose | Cost | Time |
|---|---------|---------|------|------|
| 1 | Supabase | PostgreSQL database + file storage | Free | 10 min |
| 2 | Privy | User login + Solana wallet creation | Free (1K users) | 10 min |

### Recommended for Development (improves the experience)
| # | Service | Purpose | Cost | Time |
|---|---------|---------|------|------|
| 3 | Upstash Redis | API response caching | Free (10K/day) | 5 min |
| 4 | Helius | Solana blockchain data (wallet balances) | Free (1M credits) | 5 min |

### Required for Production
| # | Service | Purpose | Cost | Time |
|---|---------|---------|------|------|
| 5 | Veriff | KYC identity verification for creators | ~$2/verification | 15 min |
| 6 | Vercel | Host the API + landing page | Free | 10 min |
| 7 | Expo/EAS | Build the mobile app binaries | Free (30 builds/mo) | 10 min |

### Required for App Stores
| # | Service | Purpose | Cost | Time |
|---|---------|---------|------|------|
| 8 | Apple Developer | Publish to iOS App Store | $99/year | 30 min |
| 9 | Google Play + Firebase | Publish to Google Play Store | $25 one-time | 20 min |
| 10 | Domain + DNS | Custom domain (moment.network) | ~$15/year | 15 min |

### Where Each Env Var Goes

You will create **2 files** with all your secrets:

```
apps/api/.env.local          ← 14 variables (API backend)
apps/mobile/.env             ← 4 variables (mobile app)
```

The landing page has no secrets — it auto-detects Vercel.

---

## 2. Supabase

Supabase gives you a PostgreSQL database and file storage (for user avatars, post images).

### What you'll get from this step:
- `DATABASE_URL` — used by Prisma ORM to read/write data
- `DIRECT_URL` — used by Prisma for database migrations
- `NEXT_PUBLIC_SUPABASE_URL` — used for file uploads
- `SUPABASE_SERVICE_ROLE_KEY` — used for file uploads (admin key)

### Step-by-step:

1. **Go to** https://supabase.com and click **"Start your project"** (top right)

2. **Sign up** with your GitHub account (click "Continue with GitHub")

3. **Create a new organization:**
   - Name: `momento` (or whatever you want)
   - Plan: Select **"Free"**
   - Click **"Create organization"**

4. **Create a new project:**
   - Project name: `momento`
   - Database password: Click **"Generate a password"** — **COPY THIS PASSWORD and save it somewhere safe** (you'll need it in the next step)
   - Region: Pick the region closest to your users (e.g., "East US (Virginia)" for US users)
   - Click **"Create new project"**

5. **Wait 1-2 minutes** for the project to finish setting up. You'll see a loading spinner.

6. **Get your database connection strings:**
   - In the left sidebar, click the **gear icon** (Settings) at the bottom
   - Click **"Database"** in the settings menu
   - Scroll down to **"Connection string"** section
   - You'll see a tab bar with "URI" selected. Make sure **"URI"** is active
   - Find the **"Transaction" mode** connection string — it looks like:
     ```
     postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```
   - **Copy this** — this is your `DATABASE_URL`
   - Now click **"Session"** tab to see the session/direct connection string:
     ```
     postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
     ```
   - **Copy this** — this is your `DIRECT_URL`
   - **Important:** If you see `[YOUR-PASSWORD]` in the strings, replace it with the password you saved in step 4

7. **Get your project URL:**
   - In the left sidebar, click the **gear icon** (Settings)
   - Click **"API"** in the settings menu
   - Under **"Project URL"**, copy the URL that looks like:
     ```
     https://abcdefghijklmnop.supabase.co
     ```
   - This is your `NEXT_PUBLIC_SUPABASE_URL`

8. **Get your service role key:**
   - On the same **"API"** settings page, scroll down to **"Project API keys"**
   - Find the key labeled **"service_role"** (it says "secret" next to it)
   - Click **"Reveal"** to show it, then **copy the entire key**
   - This is your `SUPABASE_SERVICE_ROLE_KEY`
   - **WARNING:** This key has full admin access. Never share it or put it in frontend code.

9. **Enable PostGIS extension** (needed for location-based queries):
   - In the left sidebar, click **"Database"** (the cylinder icon)
   - Click **"Extensions"** in the sub-menu
   - Search for **"postgis"** in the search box
   - Click the toggle to **enable** PostGIS
   - A confirmation popup appears — click **"Enable extension"**

10. **Create the storage bucket** (for image uploads):
    - In the left sidebar, click **"Storage"** (the folder icon)
    - Click **"New bucket"**
    - Bucket name: `momento-uploads`
    - Toggle **"Public bucket"** to **ON** (so uploaded images can be viewed by anyone)
    - Click **"Save"**

11. **Set storage bucket policies** (allow authenticated uploads):
    - Click on the `momento-uploads` bucket you just created
    - Click the **"Policies"** tab at the top
    - Click **"New policy"**
    - Choose **"For full customization"**
    - Policy name: `Allow authenticated uploads`
    - Allowed operation: Check **INSERT**
    - Target roles: Select **"authenticated"**
    - Click **"Review"** then **"Save policy"**
    - Create another policy:
      - Policy name: `Allow public reads`
      - Allowed operation: Check **SELECT**
      - Target roles: Select **"anon"** (anonymous/public)
      - Click **"Review"** then **"Save policy"**

### Add to your env file:

Open (or create) `apps/api/.env.local` and add:

```bash
# ─── Database (Supabase PostgreSQL) ──────────────────────────────────────────
DATABASE_URL="postgresql://postgres.[YOUR_PROJECT_REF]:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[YOUR_PROJECT_REF]:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# ─── Supabase Storage ────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR_PROJECT_REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

Replace the bracketed values with your actual values from steps 6-8.

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `DATABASE_URL` | `apps/api/prisma/schema.prisma` | 7 | Connects Prisma ORM to your database |
| `DIRECT_URL` | `apps/api/prisma/schema.prisma` | 8 | Direct connection for running migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/api/lib/storage.ts` | 5 | Supabase client for file uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/api/lib/storage.ts` | 6 | Admin auth for creating upload URLs |

---

## 3. Privy

Privy handles user login (Google, Apple, email) and automatically creates a Solana wallet for each user.

### What you'll get from this step:
- `NEXT_PUBLIC_PRIVY_APP_ID` — identifies your app (used in API + mobile)
- `PRIVY_APP_SECRET` — server-side secret for verifying auth tokens
- `EXPO_PUBLIC_PRIVY_APP_ID` — same app ID, used by the mobile app

### Step-by-step:

1. **Go to** https://dashboard.privy.io and click **"Sign Up"**

2. **Create an account** using your email or Google account

3. **Create a new app:**
   - Click **"Create new app"** (or **"+ New app"**)
   - App name: `Momento`
   - Click **"Create"**

4. **Get your App ID:**
   - You'll land on the app dashboard
   - In the left sidebar, click **"Settings"**
   - Under **"Basics"**, find **"App ID"** — it looks like: `clxxxxxxxxxxxxxxxxxx`
   - **Copy this** — this is both your `NEXT_PUBLIC_PRIVY_APP_ID` AND `EXPO_PUBLIC_PRIVY_APP_ID` (same value)

5. **Get your App Secret:**
   - On the same Settings page, find **"App secret"**
   - Click **"Reveal"** or **"Show"**
   - **Copy this** — this is your `PRIVY_APP_SECRET`

6. **Configure login methods:**
   - In the left sidebar, click **"Login methods"**
   - Enable the methods you want users to log in with:
     - Toggle **"Google"** ON
     - Toggle **"Apple"** ON (requires Apple Developer account — see section 9)
     - Toggle **"Email"** ON (sends magic link emails)
   - Click **"Save"**

7. **Configure embedded wallets:**
   - In the left sidebar, click **"Embedded wallets"**
   - Under "Create embedded wallets for users", select **"All users"**
   - Under "Chain type", make sure **"Solana"** is checked
   - Make sure **"Ethereum"** is unchecked (we only use Solana)
   - Click **"Save"**

8. **Set allowed domains** (for the API to verify tokens):
   - In the left sidebar, click **"Settings"**
   - Scroll to **"Allowed domains"**
   - Add your domains:
     - `http://localhost:3000` (for local API development)
     - `https://your-api-domain.vercel.app` (your production API — add after Vercel setup)
   - Click **"Save"**

### Add to your env files:

**API** — add to `apps/api/.env.local`:
```bash
# ─── Privy Authentication ────────────────────────────────────────────────────
NEXT_PUBLIC_PRIVY_APP_ID="clxxxxxxxxxxxxxxxxxx"
PRIVY_APP_SECRET="your-privy-app-secret-here"
```

**Mobile** — create `apps/mobile/.env` and add:
```bash
EXPO_PUBLIC_PRIVY_APP_ID="clxxxxxxxxxxxxxxxxxx"
```

(Use the SAME App ID value in both files.)

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | `apps/api/lib/auth.ts` | 6 | Privy client initialization |
| `PRIVY_APP_SECRET` | `apps/api/lib/auth.ts` | 7 | Server-side token verification |
| `EXPO_PUBLIC_PRIVY_APP_ID` | `apps/mobile/src/config/env.ts` | 10 | Mobile Privy SDK initialization |

---

## 4. Upstash Redis

Upstash is a serverless Redis cache. It makes the API faster by caching responses (feed, profiles) so the database isn't hit every time.

### What you'll get from this step:
- `UPSTASH_REDIS_REST_URL` — the Redis endpoint URL
- `UPSTASH_REDIS_REST_TOKEN` — authentication token

### Step-by-step:

1. **Go to** https://console.upstash.com and click **"Sign Up"**

2. **Sign up** with GitHub, Google, or email

3. **Create a new Redis database:**
   - Click **"Create database"** (or the **"+"** button)
   - Name: `momento-cache`
   - Type: **Regional** (cheaper, fine for a single-region app)
   - Region: Pick the **same region** as your Supabase project (e.g., "US-East-1")
   - Check **"TLS (SSL)"** is enabled (it should be by default)
   - Click **"Create"**

4. **Get your credentials:**
   - After creation, you'll see the database details page
   - Find **"REST API"** section (there are tabs: "Redis CLI", "REST API", etc.)
   - Click the **"REST API"** tab
   - You'll see two values:
     - **UPSTASH_REDIS_REST_URL**: `https://xxxx-xxxxx-xxxxx.upstash.io`
     - **UPSTASH_REDIS_REST_TOKEN**: A long string starting with `AX...` or similar
   - **Copy both values**

   Alternatively, look for a **".env"** tab — it shows both values pre-formatted.

### Add to your env file:

Add to `apps/api/.env.local`:
```bash
# ─── Upstash Redis ───────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL="https://xxxx-xxxxx-xxxxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `UPSTASH_REDIS_REST_URL` | `apps/api/lib/redis.ts` | 4 | Redis client connection endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | `apps/api/lib/redis.ts` | 5 | Redis client authentication |

---

## 5. Helius

Helius provides fast access to Solana blockchain data. Momento uses it to fetch wallet balances and token holdings.

### What you'll get from this step:
- `HELIUS_API_KEY` — API key for Solana RPC calls

### Step-by-step:

1. **Go to** https://dev.helius.xyz and click **"Sign Up"** (or **"Get Started"**)

2. **Sign up** with GitHub or email

3. **You'll land on the dashboard.** A default API key is usually auto-created.

4. **Get your API key:**
   - On the dashboard, you should see your API key displayed
   - It looks like a UUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - If no key exists, click **"Create API Key"**
   - **Copy the API key**

5. **Note your RPC endpoints** (for reference):
   - Mainnet: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
   - Devnet: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`
   - The API backend uses the key directly via the Helius SDK, so you only need the key, not the full URL

### Add to your env files:

**API** — add to `apps/api/.env.local`:
```bash
# ─── Helius (Solana RPC) ─────────────────────────────────────────────────────
HELIUS_API_KEY="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Mobile** (optional, for direct RPC from mobile) — add to `apps/mobile/.env`:
```bash
EXPO_PUBLIC_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY_HERE"
EXPO_PUBLIC_SOLANA_NETWORK="devnet"
```

For production, change `devnet` to `mainnet-beta` and use the mainnet URL.

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `HELIUS_API_KEY` | `apps/api/lib/helius.ts` | 3 | Helius SDK initialization for wallet queries |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | `apps/mobile/src/config/env.ts` | 13 | Mobile Solana RPC endpoint |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `apps/mobile/src/config/env.ts` | 16 | Network selection (devnet/mainnet) |

---

## 6. Veriff

Veriff handles KYC (Know Your Customer) identity verification. When a user wants to become a creator, they go through Veriff's identity check (selfie + ID document). **You can skip this for development** by setting `SKIP_KYC=true`.

### What you'll get from this step:
- `VERIFF_API_KEY` — authenticates API calls to Veriff
- `VERIFF_SHARED_SECRET` — verifies webhook signatures from Veriff

### Step-by-step:

1. **Go to** https://www.veriff.com and click **"Get started"** or **"Talk to sales"**
   - **Note:** Veriff requires a business application. They may ask about your use case.
   - For testing, you can use their **sandbox/demo** environment

2. **Sign up for a Veriff Station account:**
   - Go to https://station.veriff.com
   - Create an account with your email
   - Complete the onboarding form:
     - Company name: Your company name
     - Use case: "Creator verification for social platform"
     - Expected volume: "Less than 100/month" (for dev)

3. **Once approved, access your dashboard:**
   - Log in to https://station.veriff.com
   - You'll see your integration overview

4. **Get your API key:**
   - Navigate to **"Integrations"** or **"Settings"** in the sidebar
   - Find **"API Keys"** section
   - Copy the **API Key** (also called "API key" or "Public key")
   - This is your `VERIFF_API_KEY`

5. **Get your shared secret:**
   - On the same page, find **"Shared secret"** (also called "HMAC secret")
   - Click to reveal and **copy it**
   - This is your `VERIFF_SHARED_SECRET`

6. **Configure the webhook URL** (do this AFTER deploying your API to Vercel):
   - In Veriff Station, go to **"Integrations"** > **"Webhooks"**
   - Set the webhook URL to: `https://your-api.vercel.app/api/kyc/webhook`
   - This is where Veriff sends the verification result after a user completes KYC

### For development (skip Veriff entirely):

Just set `SKIP_KYC=true` in your env file. This makes the `/creators/apply` endpoint instantly approve creator applications without running KYC. This is the recommended approach for development.

### Add to your env file:

Add to `apps/api/.env.local`:
```bash
# ─── Veriff (KYC) ────────────────────────────────────────────────────────────
VERIFF_API_KEY="your-veriff-api-key"
VERIFF_SHARED_SECRET="your-veriff-shared-secret"
```

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `VERIFF_API_KEY` | `apps/api/lib/veriff.ts` | 4 | Authenticates Veriff API requests |
| `VERIFF_SHARED_SECRET` | `apps/api/lib/veriff.ts` | 5 | Verifies HMAC signatures on webhooks |

---

## 7. Vercel

Vercel hosts both the API backend (Next.js) and the landing page. Both are deployed from the same monorepo.

### What you'll get from this step:
- Hosted API at `https://your-project.vercel.app`
- Hosted landing page at `https://momento-landing.vercel.app` (or your custom domain)

### Step-by-step:

1. **Go to** https://vercel.com and click **"Sign Up"**

2. **Sign up with GitHub** (recommended — makes deployment automatic)

3. **Push your code to GitHub first** (if not already done):
   ```bash
   # In your momento/ directory:
   git remote add origin https://github.com/YOUR_USERNAME/momento.git
   git push -u origin main
   ```

4. **Import the API project:**
   - On the Vercel dashboard, click **"Add New..."** > **"Project"**
   - Select your `momento` GitHub repository
   - Vercel will detect it's a monorepo

   **Configure the API deployment:**
   - Framework Preset: **Next.js**
   - Root Directory: Click **"Edit"** and type `apps/api`
   - Build Command: Leave as default (`next build`)
   - Output Directory: Leave as default
   - Click **"Deploy"**

5. **Add environment variables to the API project:**
   - After deployment (even if it fails), go to your project in Vercel
   - Click **"Settings"** tab > **"Environment Variables"**
   - Add each variable from your `apps/api/.env.local` one by one:
     - `DATABASE_URL` = your Supabase transaction URL
     - `DIRECT_URL` = your Supabase direct URL
     - `NEXT_PUBLIC_PRIVY_APP_ID` = your Privy app ID
     - `PRIVY_APP_SECRET` = your Privy secret
     - `UPSTASH_REDIS_REST_URL` = your Upstash URL
     - `UPSTASH_REDIS_REST_TOKEN` = your Upstash token
     - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
     - `HELIUS_API_KEY` = your Helius key
     - `VERIFF_API_KEY` = your Veriff key
     - `VERIFF_SHARED_SECRET` = your Veriff secret
     - `NEXT_PUBLIC_API_URL` = `https://your-api-project.vercel.app` (use the URL Vercel gave you)
     - `SKIP_KYC` = `true` (for now, while testing)
   - Click **"Save"** for each one
   - After adding all variables, click **"Deployments"** tab, find the latest deployment, click the **"..."** menu, and click **"Redeploy"**

6. **Import the landing page project** (separate Vercel project):
   - Go back to the Vercel dashboard
   - Click **"Add New..."** > **"Project"** again
   - Select the same `momento` repository
   - **Configure:**
     - Root Directory: Click **"Edit"** and type `apps/landing`
     - Framework Preset: **Next.js**
   - Click **"Deploy"**
   - No environment variables needed for the landing page

7. **Note your deployment URLs:**
   - API: `https://momento-api.vercel.app` (or whatever Vercel assigned)
   - Landing: `https://momento-landing.vercel.app`

8. **Update your API URL in Privy** (step 8 of Privy setup):
   - Go back to https://dashboard.privy.io
   - Add your Vercel API URL to the allowed domains list

### Add to your env file:

Add to `apps/api/.env.local`:
```bash
# ─── App Config ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL="https://your-api-project.vercel.app"
SKIP_KYC="true"
```

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `NEXT_PUBLIC_API_URL` | `apps/api/lib/veriff.ts` | 29 | Veriff webhook callback URL |
| `SKIP_KYC` | `apps/api/app/api/creators/apply/route.ts` | 47 | Bypasses KYC in development |

---

## 8. Expo / EAS

Expo is the framework for the mobile app. EAS (Expo Application Services) builds the app into installable files (.apk for Android, .ipa for iOS).

### What you'll get from this step:
- Ability to build and distribute the mobile app
- An Expo project ID linked to your account

### Step-by-step:

1. **Go to** https://expo.dev and click **"Sign Up"**

2. **Create an account** with GitHub or email

3. **Install EAS CLI** on your computer:
   ```bash
   npm install -g eas-cli
   ```

4. **Log in from the terminal:**
   ```bash
   eas login
   ```
   Enter your email and password when prompted.

5. **Link the project** (run from the `apps/mobile/` directory):
   ```bash
   cd apps/mobile
   eas init
   ```
   - This will ask to create a new project on Expo or link to an existing one
   - Select **"Create a new project"**
   - Name: `momento`
   - This adds a `projectId` to your `app.json` (or creates `app.config.js`)

6. **Set up your build profiles** — the `eas.json` file already exists in `apps/mobile/`. Verify it looks like this:
   ```json
   {
     "cli": { "version": ">= 3.0.0" },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal"
       },
       "production": {}
     }
   }
   ```

7. **Build a development APK** (for testing on Android):
   ```bash
   eas build --profile development --platform android
   ```
   - This uploads your code to Expo's build servers
   - Takes 5-15 minutes
   - When done, you'll get a download link for the .apk file
   - Install the .apk on your Android phone or emulator

8. **Build for iOS** (requires Apple Developer account — see section 9):
   ```bash
   eas build --profile development --platform ios
   ```

### Add to your env file:

Create `apps/mobile/.env` and add (if you haven't already):
```bash
EXPO_PUBLIC_API_URL="https://your-api-project.vercel.app/api"
EXPO_PUBLIC_PRIVY_APP_ID="clxxxxxxxxxxxxxxxxxx"
EXPO_PUBLIC_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
EXPO_PUBLIC_SOLANA_NETWORK="devnet"
```

For local development, use:
```bash
EXPO_PUBLIC_API_URL="http://YOUR_COMPUTER_IP:3000/api"
```

(Use your computer's local IP, not `localhost`, so your phone can reach it.)

### Files that use these variables:
| Variable | File | Line | What it does |
|----------|------|------|--------------|
| `EXPO_PUBLIC_API_URL` | `apps/mobile/src/config/env.ts` | 7 | API endpoint for all data fetching |
| `EXPO_PUBLIC_PRIVY_APP_ID` | `apps/mobile/src/config/env.ts` | 10 | Privy SDK init on mobile |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | `apps/mobile/src/config/env.ts` | 13 | Solana RPC for mobile wallet |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `apps/mobile/src/config/env.ts` | 16 | devnet vs mainnet-beta |

---

## 9. Apple Developer

Required to build and distribute the iOS app. Costs $99/year.

### What you'll get from this step:
- Ability to build iOS .ipa files via EAS
- Ability to publish to the App Store
- Apple Sign-In capability for Privy

### Step-by-step:

1. **Go to** https://developer.apple.com/account

2. **Sign in** with your Apple ID (create one at https://appleid.apple.com if needed)

3. **Enroll in the Apple Developer Program:**
   - Click **"Join the Apple Developer Program"** or visit https://developer.apple.com/programs/enroll/
   - Click **"Start Your Enrollment"**
   - Choose enrollment type:
     - **Individual** ($99/year) — if publishing under your name
     - **Organization** ($99/year) — if publishing under a company (requires D-U-N-S number)
   - Complete the purchase
   - **Note:** Apple may take 24-48 hours to verify your account

4. **Create an App ID:**
   - Go to https://developer.apple.com/account/resources/identifiers/list
   - Click **"+"** to register a new identifier
   - Select **"App IDs"** > click **"Continue"**
   - Select **"App"** > click **"Continue"**
   - Description: `Momento`
   - Bundle ID: Select **"Explicit"** and enter: `com.momento.app` (or match your `app.json` bundleIdentifier)
   - Under **"Capabilities"**, check **"Sign In with Apple"** (for Privy Apple login)
   - Click **"Continue"** > **"Register"**

5. **Create a provisioning profile** (EAS can do this automatically):
   - When you run `eas build --platform ios`, EAS will prompt you to log in with your Apple ID
   - It will automatically create the needed certificates and provisioning profiles
   - Just follow the prompts

6. **For Apple Sign-In in Privy:**
   - Go back to the Privy dashboard (https://dashboard.privy.io)
   - Navigate to **"Login methods"** > **"Apple"**
   - You'll need to create a **Services ID** and **Key** in the Apple Developer portal
   - Follow Privy's Apple setup guide linked in their dashboard

### No env vars needed for this step
Apple credentials are managed by EAS CLI and Privy dashboard, not environment variables.

---

## 10. Google Play + Firebase

Required to distribute the Android app on the Google Play Store. Firebase is needed for push notifications on Android.

### What you'll get from this step:
- Google Play Console access for publishing
- Firebase project for push notifications (via Expo)
- `google-services.json` file for the mobile app

### Step-by-step:

### Part A: Google Play Console

1. **Go to** https://play.google.com/console

2. **Create a developer account:**
   - Click **"Create a developer account"**
   - Pay the **one-time $25 registration fee**
   - Fill in your developer name and details
   - Complete identity verification (may take 1-3 days)

3. **Create an app listing** (do this after your app is built):
   - Click **"Create app"**
   - App name: `Momento`
   - Default language: English
   - App or Game: **App**
   - Free or Paid: **Free**
   - Complete the declarations checkboxes
   - Click **"Create app"**

### Part B: Firebase (for push notifications)

4. **Go to** https://console.firebase.google.com

5. **Create a new project:**
   - Click **"Create a project"** (or **"Add project"**)
   - Project name: `Momento`
   - Google Analytics: You can disable this (not needed)
   - Click **"Create project"**

6. **Add an Android app to Firebase:**
   - On the project overview page, click the **Android icon** to add an Android app
   - Android package name: `com.momento.app` (must match your `app.json` package name)
   - App nickname: `Momento`
   - SHA-1 certificate: Skip for now (click **"Register app"**)

7. **Download `google-services.json`:**
   - After registering the app, Firebase will show a download button for `google-services.json`
   - **Download this file**
   - Place it in: `apps/mobile/google-services.json`
   - This file is needed for push notifications to work on Android

8. **Enable Cloud Messaging:**
   - In the Firebase console, click the **gear icon** (Settings) > **"Project settings"**
   - Click the **"Cloud Messaging"** tab
   - If "Cloud Messaging API (V1)" is disabled, click **"Enable"** next to it
   - You don't need to copy any keys — Expo handles this via the `google-services.json` file

### Part C: Link Firebase to EAS

9. **Upload your FCM credentials to Expo:**
   - In Firebase console, go to **Project settings** > **"Service accounts"**
   - Click **"Generate new private key"** > **"Generate key"**
   - This downloads a JSON file (something like `momento-firebase-adminsdk-xxxxx.json`)
   - Upload it to Expo:
     ```bash
     eas credentials --platform android
     ```
   - Select **"Push Notifications: Manage your FCM V1 API Key"**
   - Select **"Upload a Firebase Service Account Key"**
   - Browse to the downloaded JSON file

### No env vars needed for this step
Firebase credentials are managed through `google-services.json` and EAS credentials, not environment variables.

---

## 11. Domain & DNS

Set up a custom domain for your landing page and API.

### What you'll get from this step:
- `moment.network` (or your chosen domain) pointing to your Vercel deployments

### Step-by-step:

1. **Buy a domain** from any registrar:
   - Popular options: Namecheap (https://namecheap.com), Cloudflare (https://dash.cloudflare.com), Google Domains, GoDaddy
   - Search for your domain (e.g., `moment.network`)
   - Complete the purchase

2. **Add the domain to Vercel (landing page):**
   - Go to your **landing page project** in Vercel
   - Click **"Settings"** > **"Domains"**
   - Type your domain: `moment.network`
   - Click **"Add"**
   - Vercel will show you DNS records to configure:
     ```
     Type: A     Name: @    Value: 76.76.21.21
     Type: CNAME Name: www  Value: cname.vercel-dns.com
     ```

3. **Add a subdomain for the API:**
   - Go to your **API project** in Vercel
   - Click **"Settings"** > **"Domains"**
   - Type: `api.moment.network`
   - Click **"Add"**
   - Vercel will show you:
     ```
     Type: CNAME Name: api  Value: cname.vercel-dns.com
     ```

4. **Configure DNS at your registrar:**
   - Log in to your domain registrar (Namecheap, Cloudflare, etc.)
   - Find the **DNS settings** or **"Manage DNS"** for your domain
   - **Delete any existing A or CNAME records** for `@` and `www`
   - Add these records:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | @ | 76.76.21.21 | Auto |
   | CNAME | www | cname.vercel-dns.com | Auto |
   | CNAME | api | cname.vercel-dns.com | Auto |

   - Click **"Save"** or **"Confirm"**
   - DNS propagation takes 5 minutes to 48 hours (usually under 30 minutes)

5. **Update your environment variables** after domain setup:
   - In `apps/api/.env.local`, update:
     ```bash
     NEXT_PUBLIC_API_URL="https://api.moment.network"
     ```
   - In `apps/mobile/.env`, update:
     ```bash
     EXPO_PUBLIC_API_URL="https://api.moment.network/api"
     ```
   - In Vercel (API project), update the `NEXT_PUBLIC_API_URL` env var to `https://api.moment.network`
   - In Privy dashboard, add `https://api.moment.network` to allowed domains

6. **Verify it works:**
   - Visit `https://moment.network` — should show your landing page
   - Visit `https://api.moment.network` — should show the API health check

---

## 12. Env Var Reference

### Complete `apps/api/.env.local`

```bash
# ─── Database (Supabase PostgreSQL) ──────────────────────────────────────────
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# ─── Privy Authentication ────────────────────────────────────────────────────
NEXT_PUBLIC_PRIVY_APP_ID=""
PRIVY_APP_SECRET=""

# ─── Upstash Redis ───────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# ─── Supabase Storage ────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""

# ─── Helius (Solana RPC) ─────────────────────────────────────────────────────
HELIUS_API_KEY=""

# ─── Veriff (KYC) ────────────────────────────────────────────────────────────
VERIFF_API_KEY=""
VERIFF_SHARED_SECRET=""

# ─── App Config ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL="http://localhost:3000"
SKIP_KYC="true"
```

**Total: 14 variables** (12 from services + 2 app config)

### Complete `apps/mobile/.env`

```bash
# ─── API Connection ──────────────────────────────────────────────────────────
EXPO_PUBLIC_API_URL="http://YOUR_LOCAL_IP:3000/api"

# ─── Privy (same App ID as API) ──────────────────────────────────────────────
EXPO_PUBLIC_PRIVY_APP_ID=""

# ─── Solana ──────────────────────────────────────────────────────────────────
EXPO_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
EXPO_PUBLIC_SOLANA_NETWORK="devnet"
```

**Total: 4 variables**

### Env Var to Source File Mapping (complete)

| Variable | File | Line | Service |
|----------|------|------|---------|
| `DATABASE_URL` | `apps/api/prisma/schema.prisma` | 7 | Supabase |
| `DIRECT_URL` | `apps/api/prisma/schema.prisma` | 8 | Supabase |
| `NEXT_PUBLIC_PRIVY_APP_ID` | `apps/api/lib/auth.ts` | 6 | Privy |
| `PRIVY_APP_SECRET` | `apps/api/lib/auth.ts` | 7 | Privy |
| `UPSTASH_REDIS_REST_URL` | `apps/api/lib/redis.ts` | 4 | Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | `apps/api/lib/redis.ts` | 5 | Upstash |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/api/lib/storage.ts` | 5 | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/api/lib/storage.ts` | 6 | Supabase |
| `HELIUS_API_KEY` | `apps/api/lib/helius.ts` | 3 | Helius |
| `VERIFF_API_KEY` | `apps/api/lib/veriff.ts` | 4 | Veriff |
| `VERIFF_SHARED_SECRET` | `apps/api/lib/veriff.ts` | 5 | Veriff |
| `NEXT_PUBLIC_API_URL` | `apps/api/lib/veriff.ts` | 29 | App Config |
| `SKIP_KYC` | `apps/api/app/api/creators/apply/route.ts` | 47 | App Config |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/src/config/env.ts` | 7 | App Config |
| `EXPO_PUBLIC_PRIVY_APP_ID` | `apps/mobile/src/config/env.ts` | 10 | Privy |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | `apps/mobile/src/config/env.ts` | 13 | Helius |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `apps/mobile/src/config/env.ts` | 16 | Solana |

---

## 13. Verification Checklist

Run through this checklist after setting up all services.

### Database
- [ ] `apps/api/.env.local` has `DATABASE_URL` and `DIRECT_URL`
- [ ] Run `cd apps/api && npx prisma generate` — should complete without errors
- [ ] Run `cd apps/api && npx prisma db push` — should create all tables
- [ ] Run `cd apps/api && npx prisma db seed` — should seed sample data
- [ ] Check Supabase dashboard > Table Editor — you should see `users`, `posts`, `likes`, `comments`, `follows`, `kyc_records` tables

### Storage
- [ ] `apps/api/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Supabase dashboard > Storage shows `momento-uploads` bucket
- [ ] Bucket has "Allow authenticated uploads" and "Allow public reads" policies

### Auth
- [ ] `apps/api/.env.local` has `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET`
- [ ] `apps/mobile/.env` has `EXPO_PUBLIC_PRIVY_APP_ID` (same value)
- [ ] Privy dashboard shows "Google" and/or "Email" login methods enabled
- [ ] Privy dashboard > Embedded wallets > Solana is enabled

### Cache
- [ ] `apps/api/.env.local` has `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- [ ] Upstash dashboard shows the `momento-cache` database is active

### Blockchain
- [ ] `apps/api/.env.local` has `HELIUS_API_KEY`
- [ ] `apps/mobile/.env` has `EXPO_PUBLIC_SOLANA_RPC_URL` and `EXPO_PUBLIC_SOLANA_NETWORK`

### KYC (optional for dev)
- [ ] `SKIP_KYC="true"` is set in `apps/api/.env.local` (for development)
- [ ] OR: `VERIFF_API_KEY` and `VERIFF_SHARED_SECRET` are set (for production)

### API Server
- [ ] Run `cd apps/api && pnpm dev` — server starts on port 3000
- [ ] Visit `http://localhost:3000` — shows health check page
- [ ] Visit `http://localhost:3000/api/feed?lat=40.7&lng=-74.0&radius=50` — returns JSON with `{ success: true, data: { items: [...] } }`

### Mobile App
- [ ] `apps/mobile/.env` has all 4 variables filled in
- [ ] Run `cd apps/mobile && pnpm start` — Expo dev server starts
- [ ] Scan the QR code with Expo Go app — app launches on your phone
- [ ] Login screen appears with Privy authentication options

### Vercel (production)
- [ ] API project deployed with all env vars added
- [ ] Landing page project deployed
- [ ] Both projects show green "Ready" status
- [ ] Custom domain (if configured) resolves correctly

### First Run Script

After filling in all env vars, run this sequence:

```bash
# 1. Install all dependencies
pnpm install

# 2. Approve Prisma build scripts (first time only — interactive prompt)
pnpm approve-builds

# 3. Generate Prisma client
cd apps/api
npx prisma generate

# 4. Push database schema (creates tables)
npx prisma db push

# 5. Apply PostGIS migration (for location queries)
npx prisma migrate deploy

# 6. Seed sample data (optional)
npx prisma db seed

# 7. Start the API server (port 3000)
pnpm dev

# 8. In a new terminal, start the mobile app
cd apps/mobile
pnpm start

# 9. (Optional) In another terminal, start the landing page (port 3001)
cd apps/landing
pnpm dev
```

> **Important:** Step 2 (`pnpm approve-builds`) is required the first time you clone the repo. pnpm blocks package build scripts by default, and Prisma needs to run its postinstall script to function. If you skip this, `npx prisma generate` will fail.

---

## Troubleshooting

### "Cannot find module '@prisma/client'"
Run `pnpm approve-builds` (first time only), then `cd apps/api && npx prisma generate`. The `approve-builds` step is needed because pnpm blocks package build scripts by default and Prisma requires its postinstall script to run.

### "Error: connect ECONNREFUSED" on database
Your `DATABASE_URL` is wrong. Double-check:
- The password is correct (no brackets left)
- The region matches your Supabase project
- Port 6543 for transaction mode, 5432 for direct

### "Unauthorized" errors from API
Your Privy credentials are wrong or the mobile app's `EXPO_PUBLIC_PRIVY_APP_ID` doesn't match the API's `NEXT_PUBLIC_PRIVY_APP_ID`. They MUST be the same value.

### "Invalid API key" from Helius
Your `HELIUS_API_KEY` is wrong or expired. Check https://dev.helius.xyz for your current key.

### EAS build fails with "Missing credentials"
Run `eas credentials` and follow the prompts to set up signing certificates.

### Mobile app shows blank screen
Check that `EXPO_PUBLIC_API_URL` points to a reachable API. If testing locally, use your computer's local IP (e.g., `http://192.168.1.100:3000/api`), not `localhost`.
