# Momento — Gaps & Human Actions Required

Everything that needs a human to register, configure, or provide before the app can run end-to-end.

---

## 1. Developer Accounts (One-Time Registrations)

| # | Service | Action | Cost | URL | Status |
|---|---------|--------|------|-----|--------|
| 1.1 | **Apple Developer Program** | Enroll in developer program | $99/year | https://developer.apple.com/programs/ | [ ] |
| 1.2 | **Google Play Console** | Register developer account | $25 one-time | https://play.google.com/console | [ ] |
| 1.3 | **Expo / EAS** | Create account, install CLI (`npm i -g eas-cli`), run `eas login` | Free | https://expo.dev | [ ] |
| 1.4 | **Vercel** | Create account, install CLI (`npm i -g vercel`), run `vercel login` | $20/mo (Pro) | https://vercel.com | [ ] |

---

## 2. External Services — Registration & Configuration

### 2.1 Supabase (Database + Storage)
- **Register** at https://supabase.com
- **Create project** — choose region closest to target users
- **Enable PostGIS extension** via SQL Editor:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  ```
- **Create storage buckets** (all set to public):
  - `avatars`
  - `banners`
  - `posts`
  - `momento-uploads`
- **Collect credentials**:
  - `DATABASE_URL` — Connection string (pgbouncer mode, from Settings > Database)
  - `DIRECT_URL` — Direct connection string (for migrations)
  - `NEXT_PUBLIC_SUPABASE_URL` — Project URL (from Settings > API)
  - `SUPABASE_SERVICE_ROLE_KEY` — Service role key (from Settings > API, **keep secret**)
- **Cost**: $25/month (Pro plan)
- **Status**: [ ]

### 2.2 Privy (Authentication + Embedded Wallets)
- **Register** at https://privy.io
- **Create new app** in dashboard
- **Configure login methods**: Enable Google and Apple OAuth
- **Enable embedded Solana wallets** in wallet settings
- **Add allowed origins**:
  - `http://localhost:3000` (dev)
  - `https://your-api.vercel.app` (prod)
  - Your mobile app scheme: `momento://`
- **Collect credentials**:
  - `NEXT_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_APP_ID` — App ID
  - `PRIVY_APP_SECRET` — App secret (from API settings)
- **Cost**: Free tier
- **Status**: [ ]

### 2.3 Upstash (Redis Cache)
- **Register** at https://upstash.com
- **Create Redis database** — choose same region as Supabase project
- **Collect credentials**:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- **Cost**: ~$10/month (pay-as-you-go)
- **Status**: [ ]

### 2.4 Helius (Solana RPC + Token Data)
- **Register** at https://helius.dev
- **Create API key**
- **Collect credentials**:
  - `HELIUS_API_KEY`
- **Note**: Free tier includes RPC access, token balances, and metadata APIs
- **Cost**: $0–49/month
- **Status**: [ ]

### 2.5 Veriff (KYC / Identity Verification)
- **Register** at https://veriff.com
- **Contact sales** for API access (not self-serve)
- **Configure webhook URL** in Veriff dashboard:
  - `https://your-api.vercel.app/api/kyc/webhook`
- **Collect credentials**:
  - `VERIFF_API_KEY`
  - `VERIFF_SHARED_SECRET` — Used for HMAC-SHA256 webhook signature verification
- **Dev shortcut**: Set `SKIP_KYC=true` to bypass during development (saves $2/verification)
- **Cost**: ~$2 per verification
- **Status**: [ ]

---

## 3. Environment Variables — Complete Checklist

### 3.1 API Server (`apps/api/.env.local`)

| Variable | Source | Secret? |
|----------|--------|---------|
| `DATABASE_URL` | Supabase > Settings > Database (pgbouncer) | Yes |
| `DIRECT_URL` | Supabase > Settings > Database (direct) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Settings > API | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy dashboard | No |
| `PRIVY_APP_SECRET` | Privy > API settings | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash console | No |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console | Yes |
| `HELIUS_API_KEY` | Helius dashboard | Yes |
| `VERIFF_API_KEY` | Veriff dashboard | Yes |
| `VERIFF_SHARED_SECRET` | Veriff dashboard | Yes |
| `NEXT_PUBLIC_API_URL` | Your Vercel deployment URL | No |
| `SKIP_KYC` | Set to `true` for dev only | No |

### 3.2 Mobile App (`apps/mobile/.env`)

| Variable | Source | Secret? |
|----------|--------|---------|
| `EXPO_PUBLIC_API_URL` | Your API deployment URL | No |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Privy dashboard (same as API) | No |
| `EXPO_PUBLIC_SOLANA_RPC_URL` | `https://api.devnet.solana.com` (dev) or Helius mainnet URL | No |
| `EXPO_PUBLIC_SOLANA_NETWORK` | `devnet` (dev) or `mainnet-beta` (prod) | No |

---

## 4. App Store & Deployment Configuration

### 4.1 Apple (iOS)
- [ ] **Bundle ID**: Register `com.momento.app` in Apple Developer portal
- [ ] **Capabilities**: Enable Push Notifications and Sign In with Apple
- [ ] **Provisioning profiles**: Generate via Xcode or Apple Developer portal
- [ ] **App Store Connect**: Create app listing (needed for `ascAppId` in `eas.json`)
- [ ] **Team ID**: Add to `eas.json` under `submit.production.ios.appleTeamId`

### 4.2 Google Play (Android)
- [ ] **Package name**: Register `com.momento.app`
- [ ] **Service account**: Create Google Cloud service account with Play Console access
- [ ] **Service account key**: Download as `google-services.json`, place in `apps/mobile/`
- [ ] **Internal testing track**: Set up for initial distribution

### 4.3 EAS Build Placeholders to Replace
In `apps/mobile/eas.json`, these need real values:
- `submit.production.ios.ascAppId` → App Store Connect app ID
- `submit.production.ios.appleTeamId` → Apple Developer Team ID
- `submit.production.ios.appleId` → Currently `developer@momento.app`

### 4.4 Vercel Deployment
- [ ] Link API project: `cd apps/api && vercel link`
- [ ] Link landing project: `cd apps/landing && vercel link`
- [ ] Set all env vars from Section 3.1 in Vercel dashboard (Settings > Environment Variables)
- [ ] Deploy region is pre-configured to `iad1` (N. Virginia)

---

## 5. Webhook & Callback URLs to Configure

| Service | URL to Register | Where to Set It |
|---------|-----------------|-----------------|
| **Veriff** | `https://<your-api>.vercel.app/api/kyc/webhook` | Veriff dashboard > Webhook settings |
| **Privy** | Allowed origins for your domains | Privy dashboard > App settings |
| **Expo Push** | Automatic (no config needed) | — |

---

## 6. Database Migrations

After all env vars are set, run in order:

```bash
cd apps/api
npx prisma generate        # Generate Prisma client
npx prisma db push         # Push schema to Supabase (creates tables + indexes)
```

**Manual SQL** (PostGIS columns not managed by Prisma):
```sql
-- Add geography columns for spatial queries (run in Supabase SQL Editor)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS idx_posts_location ON posts USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST(location);

-- Trigger to auto-populate geography column from lat/lng on posts
CREATE OR REPLACE FUNCTION update_post_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER post_location_trigger
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_location();
```

---

## 7. Asset Files Needed

| File | Location | Purpose |
|------|----------|---------|
| App icon | `apps/mobile/assets/icon.png` | Main app icon (1024x1024) |
| Adaptive icon | `apps/mobile/assets/adaptive-icon.png` | Android adaptive icon |
| Splash screen | `apps/mobile/assets/splash-icon.png` | Launch screen image |
| Notification icon | `apps/mobile/assets/notification-icon.png` | Android notification (white on transparent) |
| Favicon | `apps/mobile/assets/favicon.png` | Web favicon |
| `google-services.json` | `apps/mobile/` | Google Play service account key |

---

## 8. Monthly Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Supabase | Pro | $25 |
| Upstash Redis | Pay-as-you-go | ~$10 |
| Vercel | Pro | $20 |
| Helius | Free/Starter | $0–49 |
| Privy | Free | $0 |
| EAS (Expo) | Free | $0 |
| Apple Developer | Annual | ~$8/mo |
| Veriff KYC | Per verification | ~$2/user |
| **Total** | | **$63–112/mo + $2/KYC** |

---

## 9. Pre-Launch Checklist (Ordered)

```
Phase A — Accounts & Credentials
  [ ] 1. Create Supabase project, enable PostGIS, create buckets
  [ ] 2. Create Upstash Redis database (same region)
  [ ] 3. Create Privy app, enable Google/Apple OAuth + Solana wallets
  [ ] 4. Create Helius API key
  [ ] 5. Create Veriff account (contact sales for API access)
  [ ] 6. Enroll in Apple Developer Program
  [ ] 7. Register Google Play Console account

Phase B — Configuration
  [ ] 8. Fill in apps/api/.env.local with all credentials
  [ ] 9. Fill in apps/mobile/.env with public keys
  [ ] 10. Run Prisma migrations + PostGIS SQL
  [ ] 11. Configure Veriff webhook URL
  [ ] 12. Set Privy allowed origins
  [ ] 13. Replace EAS placeholders (Apple Team ID, ASC App ID)

Phase C — Deployment
  [ ] 14. Deploy API to Vercel, set env vars
  [ ] 15. Deploy landing page to Vercel
  [ ] 16. Build mobile app with EAS (development profile first)
  [ ] 17. Test full flow: login → feed → post → like → KYC → wallet

Phase D — Store Submission
  [ ] 18. Create App Store Connect listing
  [ ] 19. Create Google Play listing
  [ ] 20. Generate production build with EAS
  [ ] 21. Submit to both stores
```
