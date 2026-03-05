# Momento - Setup Guide

Complete all steps before starting the Cursor instructions.

---

## 1. Developer Accounts

### Apple Developer Program
- **URL**: https://developer.apple.com/programs/
- **Cost**: $99/year
- **Setup**:
  1. Enroll in Apple Developer Program
  2. Create App ID with capabilities:
     - Push Notifications
     - Sign In with Apple
  3. Save: Team ID, Bundle ID

### Google Play Console
- **URL**: https://play.google.com/console
- **Cost**: $25 one-time
- **Setup**:
  1. Create developer account
  2. Create new app
  3. Save: Package name (e.g., `com.momento.app`)

---

## 2. Supabase (Database + Storage)

### Create Project
1. Go to https://supabase.com
2. Create new project
3. Choose region closest to users
4. Save the generated password

### Enable PostGIS
```sql
-- Run in SQL Editor
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Get Credentials
From Project Settings → API:
- `SUPABASE_URL` → Project URL
- `SUPABASE_ANON_KEY` → anon/public key
- `SUPABASE_SERVICE_KEY` → service_role key (keep secret!)

From Project Settings → Database:
- `DATABASE_URL` → Connection string (Transaction mode)
- `DIRECT_URL` → Direct connection string

### Storage Buckets
Create in Storage section:
```
avatars   (public)
banners   (public)
posts     (public)
```

---

## 3. Upstash Redis (Caching)

1. Go to https://upstash.com
2. Create new Redis database
3. Choose region matching Supabase
4. Get credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 4. Privy (Auth + Wallets)

### Create App
1. Go to https://privy.io
2. Create new app
3. Configure:
   - **Login Methods**: Google, Apple
   - **Embedded Wallets**: Enable Solana
   - **Allowed Origins**: Add your domains

### Get Credentials
- `PRIVY_APP_ID` → App ID
- `PRIVY_APP_SECRET` → App Secret (API settings)

---

## 5. Veriff (KYC)

1. Go to https://veriff.com
2. Create account (contact sales for API access)
3. Get credentials:
   - `VERIFF_API_KEY`
   - `VERIFF_API_SECRET`
   - `VERIFF_WEBHOOK_SECRET`
4. Configure webhook URL: `https://your-api.vercel.app/api/kyc/webhook`

---

## 6. Helius (Solana RPC)

1. Go to https://helius.dev
2. Create account
3. Create new API key
4. Get: `HELIUS_API_KEY`

**Free tier includes:**
- RPC access
- Token balances API
- Token metadata API

---

## 7. Expo/EAS (Mobile Builds)

### Install CLI
```bash
npm install -g eas-cli
eas login
```

### Create Project
```bash
# Will be done during Cursor instructions
eas init
```

---

## 8. Vercel (API Hosting)

### Install CLI
```bash
npm install -g vercel
vercel login
```

### Link Project
```bash
# Will be done during Cursor instructions
cd apps/api
vercel link
```

---

## Environment Variables Summary

### API (.env.local)

```env
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Supabase
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_KEY="eyJ..."

# Redis
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxx"

# Auth
PRIVY_APP_ID="xxx"
PRIVY_APP_SECRET="xxx"

# KYC
VERIFF_API_KEY="xxx"
VERIFF_API_SECRET="xxx"
VERIFF_WEBHOOK_SECRET="xxx"

# Solana
HELIUS_API_KEY="xxx"

# Development
SKIP_KYC=true
```

### Mobile (.env)

```env
EXPO_PUBLIC_API_URL="http://localhost:3000"
EXPO_PUBLIC_PRIVY_APP_ID="xxx"
EXPO_PUBLIC_PROJECT_ID="xxx"
```

---

## Checklist Before Starting

- [ ] Apple Developer account active
- [ ] Google Play Console account active
- [ ] Supabase project created with PostGIS enabled
- [ ] Supabase storage buckets created
- [ ] Upstash Redis database created
- [ ] Privy app created with Solana wallets enabled
- [ ] Veriff account with API access
- [ ] Helius API key generated
- [ ] Vercel CLI installed and logged in
- [ ] EAS CLI installed and logged in
- [ ] All environment variables collected

---

## Next Step

Once all credentials are collected, proceed to `CURSOR_INSTRUCTIONS.md` Part 1.
