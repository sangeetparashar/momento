# Momento - Local Development Setup Guide

> Last updated: 2026-03-13

This guide covers everything needed to run Momento locally for development. For detailed service account setup with click-by-click instructions, see `docs/SETUP_GUIDE.md`.

---

## Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **pnpm** 10.x (`corepack enable && corepack prepare pnpm@10.30.0 --activate`)
- **Git**
- A PostgreSQL database with PostGIS (Supabase free tier works)

---

## Minimum Viable Local Setup

Not every external service is required to start developing. Here is what you actually need vs. what can wait:

| Service | Required for local dev? | Notes |
|---------|------------------------|-------|
| **Supabase (PostgreSQL + PostGIS)** | Yes | Database is essential. Storage needed for uploads. |
| **Privy** | Yes | Auth is needed for any authenticated endpoint. |
| **Upstash Redis** | No | API works without it; caching is skipped gracefully. Lib modules use lazy initialization and won't crash at import time if env vars are missing. |
| **Helius** | No | Only needed for wallet balance queries. Fails gracefully. |
| **Veriff** | No | Set `SKIP_KYC=true` to bypass. |
| **Vercel** | No | Only for production deployment. |
| **EAS / Expo** | No | Only for device builds. `pnpm start` in mobile uses Expo Go. |
| **Apple Developer** | No | Only for iOS App Store. |
| **Google Play** | No | Only for Android Play Store. |

### Lazy Initialization

All API lib modules (`redis.ts`, `auth.ts`, `storage.ts`, `helius.ts`, `veriff.ts`) use **lazy initialization** -- they do not create clients at import time. This means:
- The API server starts without crashing even if some env vars are missing.
- Errors only occur when a route actually tries to use a missing service.
- You can develop and test endpoints that don't depend on a particular service without configuring it.

---

## Step-by-Step Local Setup

### 1. Clone and Install

```bash
git clone <your-repo-url> momento
cd momento
pnpm install
```

### 2. Create Environment Files

**API** -- create `apps/api/.env.local` (copy from `apps/api/.env.local.example`):

```bash
cp apps/api/.env.local.example apps/api/.env.local
```

Then fill in the values. The actual env var names used by the codebase are:

```env
# ─── Database (Supabase PostgreSQL) ──────────────────────────────────────────
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# ─── Privy Authentication ────────────────────────────────────────────────────
NEXT_PUBLIC_PRIVY_APP_ID=""
PRIVY_APP_SECRET=""

# ─── Upstash Redis (optional for local dev) ─────────────────────────────────
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# ─── Supabase Storage ────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""

# ─── Helius / Solana RPC (optional for local dev) ───────────────────────────
HELIUS_API_KEY=""

# ─── Veriff KYC (optional -- set SKIP_KYC=true instead) ────────────────────
VERIFF_API_KEY=""
VERIFF_SHARED_SECRET=""

# ─── App Config ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL="http://localhost:3000"
SKIP_KYC="true"
```

**Mobile** -- create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL="http://YOUR_LOCAL_IP:3000/api"
EXPO_PUBLIC_PRIVY_APP_ID=""
EXPO_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com"
EXPO_PUBLIC_SOLANA_NETWORK="devnet"
```

> Use your machine's LAN IP (e.g. `192.168.1.100`), not `localhost`, so your phone/emulator can reach the API.

### 3. Approve Prisma Build Scripts (First Time Only)

pnpm requires explicit approval for packages that run build scripts. Prisma needs this:

```bash
pnpm approve-builds
```

This is interactive -- it will ask you to approve `prisma` and `@prisma/client` build scripts. Say yes.

### 4. Generate Prisma Client

```bash
cd apps/api
npx prisma generate
```

This generates the `@prisma/client` module from the schema. Without this step, imports of `@prisma/client` will fail.

### 5. Set Up the Database

Make sure your PostgreSQL database has PostGIS enabled. If using Supabase, enable it from the dashboard (Database > Extensions > search "postgis" > enable).

Then push the schema:

```bash
cd apps/api
npx prisma db push
```

This creates all tables (`users`, `posts`, `likes`, `comments`, `follows`, `kyc_records`).

Optionally seed with test data:

```bash
npx prisma db seed
```

### 6. Apply PostGIS Migration (Required for Location Queries)

The PostGIS geography column and triggers live outside Prisma's schema. Run the migration SQL manually:

```bash
cd apps/api
npx prisma migrate deploy
```

Or run the SQL in `apps/api/prisma/migrations/00_postgis_setup/migration.sql` directly in your database's SQL editor.

### 7. Start Dev Servers

**API** (runs on port 3000):
```bash
cd apps/api
pnpm dev
```

**Mobile** (Expo dev server):
```bash
cd apps/mobile
pnpm start
```

**Landing page** (runs on port 3001):
```bash
cd apps/landing
pnpm dev
```

Or use Turborepo to run everything:
```bash
# From repo root
pnpm dev
```

### 8. Verify It Works

- API health check: visit `http://localhost:3000` in your browser
- API feed endpoint: `http://localhost:3000/api/feed?lat=40.7&lng=-74.0&radius=50`
- Landing page: `http://localhost:3001`
- Mobile: scan the QR code from Expo with Expo Go on your phone

---

## Service Account Setup (Manual Steps)

These steps require human action and cannot be automated:

### Required for Development
1. **Supabase** -- https://supabase.com -- Create project, enable PostGIS, create `momento-uploads` storage bucket (public), get connection strings and API keys
2. **Privy** -- https://dashboard.privy.io -- Create app, enable Google/Apple/Email login, enable Solana embedded wallets, get App ID and App Secret

### Optional for Development
3. **Upstash Redis** -- https://console.upstash.com -- Create Redis database, get REST URL and token
4. **Helius** -- https://dev.helius.xyz -- Create account, get API key for Solana RPC
5. **Veriff** -- https://station.veriff.com -- Only if testing real KYC (otherwise use `SKIP_KYC=true`)

### Required for Production / App Stores
6. **Vercel** -- https://vercel.com -- For API and landing page hosting
7. **Expo/EAS** -- https://expo.dev -- For mobile app builds (`npm install -g eas-cli && eas login`)
8. **Apple Developer** -- https://developer.apple.com/programs/ -- $99/year for iOS builds
9. **Google Play Console** -- https://play.google.com/console -- $25 one-time for Android distribution
10. **Firebase** -- https://console.firebase.google.com -- For Android push notifications (`google-services.json`)

See `docs/SETUP_GUIDE.md` for detailed click-by-click setup instructions for each service.

---

## Mobile-Specific Setup

### For Expo Go (quickest)
Just run `pnpm start` in `apps/mobile` and scan the QR code. No EAS setup needed.

### For Device Builds (EAS)
```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas init           # Links to your Expo account
eas build --profile development --platform android   # Android APK
eas build --profile development --platform ios       # iOS (needs Apple Developer)
```

### Privy Configuration for Mobile
In the Privy dashboard, your app must be configured for Expo:
- Add `http://localhost:3000` to allowed domains
- Enable Solana embedded wallets for all users

---

## Env Var Reference (Complete)

### API: `apps/api/.env.local` (14 variables)

| Variable | Source | Required? |
|----------|--------|-----------|
| `DATABASE_URL` | Supabase > Settings > Database > Connection string (Transaction mode, port 6543) | Yes |
| `DIRECT_URL` | Supabase > Settings > Database > Connection string (Session mode, port 5432) | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy > Settings > App ID | Yes |
| `PRIVY_APP_SECRET` | Privy > Settings > App Secret | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash > Database > REST API tab | No (caching disabled without it) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash > Database > REST API tab | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API > Project URL | For uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > service_role key | For uploads |
| `HELIUS_API_KEY` | Helius dashboard | No (wallet features disabled) |
| `VERIFF_API_KEY` | Veriff Station > API Keys | No (use SKIP_KYC) |
| `VERIFF_SHARED_SECRET` | Veriff Station > Shared secret / HMAC | No (use SKIP_KYC) |
| `NEXT_PUBLIC_API_URL` | Your API URL | For Veriff webhook callback |
| `SKIP_KYC` | Set to `"true"` | Recommended for dev |

### Mobile: `apps/mobile/.env` (4 variables)

| Variable | Source | Required? |
|----------|--------|-----------|
| `EXPO_PUBLIC_API_URL` | Your API URL + `/api` suffix | Yes |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Same Privy App ID as API | Yes |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | Helius RPC URL or `https://api.devnet.solana.com` | Optional |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `devnet` or `mainnet-beta` | Optional |

---

## Troubleshooting

### "Cannot find module '@prisma/client'"
Run `pnpm approve-builds` (first time) then `cd apps/api && npx prisma generate`.

### API server crashes on startup
Check that `DATABASE_URL` is set. Other services use lazy initialization and won't crash at import time -- they only fail when a route that uses them is called.

### "Error: connect ECONNREFUSED" on database
Verify `DATABASE_URL` has the correct password (no brackets remaining), correct region, and correct port (6543 for transaction mode).

### Mobile app can't reach API
Use your machine's LAN IP in `EXPO_PUBLIC_API_URL`, not `localhost`. Example: `http://192.168.1.100:3000/api`.

### "Unauthorized" errors from API
`NEXT_PUBLIC_PRIVY_APP_ID` in `apps/api/.env.local` must match `EXPO_PUBLIC_PRIVY_APP_ID` in `apps/mobile/.env`.

---

## What's Next

See `docs/GAPS.md` for the full audit of known issues and remaining work.
See `docs/agent-guide.md` for context when handing off to AI agents.
