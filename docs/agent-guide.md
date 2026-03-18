# Momento - Agent Handoff Guide

## Purpose
This document gives any future AI agent full context to pick up work on this codebase without losing any knowledge from the initial build session.

## Current State (as of 2026-03-13, Phase 5A complete — C1-C7 fixed)

### What Exists
- Complete monorepo scaffold: turbo + pnpm workspaces
- Full API backend: 17 endpoints, 7 lib modules, Prisma schema, seed script
- Full mobile app: 12 screens, 17 components, 8 hooks, 4 providers
- Shared type package: all interfaces and enums
- Landing page: 13 components, waitlist API, Tailwind, deployed on Vercel
  - Momento logo (geometric M mark SVG) + favicon
  - Wide letter-spacing MOMENTO wordmark (matches Figma)
  - Premium CSS animations (float, pulse-glow, shimmer, bounce)
  - Generic reusable Modal component with backdrop blur + slide-up
  - Terms of Service + Privacy Policy displayed in modals (not separate pages)
  - Waitlist signups logged to Vercel function logs (uses /tmp on Vercel)
  - vercel.json with security headers
- Error boundaries + loading skeletons
- Settings sheet overlay (sub-screens are stubs)
- Animation system: AnimatedPressable, transitions.ts, enhanced PostCard/LikeButton
- AuthBridge provider wiring Privy tokens into API service
- Git: 11 commits on `main`, clean tree

### What Does NOT Exist Yet / What's Still Incomplete
- ~~7 critical mobile↔API contract bugs (C1-C7)~~ — **ALL FIXED** as of 2026-03-13
- No external services configured (all env vars are placeholders)
- Prisma client not generated (need `pnpm approve-builds` then `npx prisma generate`)
- Placeholder PNG assets (1x1 transparent PNGs)
- No tests, no CI/CD
- Explore screen uses feed data instead of `/creators/nearby` API (M1)
- Comments are hardcoded dummies — no API fetch or creation (M3, M4, m16)
- Waitlist storage is ephemeral on Vercel (/tmp) — needs proper DB for persistence

### Architecture Note: Lazy Initialization
All API lib modules (`redis.ts`, `auth.ts`, `storage.ts`, `helius.ts`, `veriff.ts`) use lazy initialization. Service clients are not created at import time. This means:
- The API server starts without crashing even if some env vars are missing.
- You only need `DATABASE_URL` + Privy credentials for minimum viable local dev.
- Errors only occur when a route tries to use a missing service.

### Next Priority: Major Gaps (M1-M10)
With C1-C7 fixed, the next work should focus on the Major Gaps in GAPS.md:
- **M1**: Explore screen should call `/creators/nearby` API
- **M3/M4/m16**: Comment creation and fetching
- **M5**: User location sync to server
- **M6**: Creator application flow (Veriff redirect)
- **M7**: Deep linking / URL scheme

## File Zones for Agent Work

When spawning agents, use these isolated zones to prevent conflicts:

| Zone | Path | Responsibility |
|------|------|---------------|
| API Routes | `apps/api/app/api/` | All API endpoint logic |
| API Libs | `apps/api/lib/` | Service modules |
| API DB | `apps/api/prisma/` | Schema, migrations, seed |
| Mobile Screens | `apps/mobile/app/` | All Expo Router screens |
| Mobile Components | `apps/mobile/src/components/` | Primitives + features |
| Mobile Hooks | `apps/mobile/src/hooks/` | React Query hooks |
| Mobile Providers | `apps/mobile/src/providers/` | Context providers |
| Mobile Services | `apps/mobile/src/services/` | API service class |
| Mobile Styles | `apps/mobile/src/styles/` | Theme, typography, layouts |
| Mobile Config | `apps/mobile/src/config/` | Env vars, dummy data |
| Mobile Utils | `apps/mobile/src/utils/` | Formatters |
| Shared Types | `packages/shared/src/` | Shared interfaces + constants |
| Landing Page | `apps/landing/` | Next.js 14 waitlist landing page |
| Landing Components | `apps/landing/components/` | Navbar, Hero, Modal, Footer, etc. |
| Docs | `docs/` | GAPS.md, agent-guide, architecture, patterns |

## Key APIs and Contracts

### Hook Return Types (what screens consume)

```typescript
// useFeed() -> useInfiniteQuery
{
  data: { pages: FeedResponse[] },
  hasNextPage: boolean,
  fetchNextPage: () => void,
  isFetchingNextPage: boolean,
  isRefetching: boolean,
  isLoading: boolean,
  refetch: () => void,
}

// useUserProfile()
{
  user: User | undefined,
  isLoading: boolean,
  updateProfile: (payload: Partial<User>) => void,
  isUpdating: boolean,
}

// useCreatorProfile(creatorId)
{
  profile: CreatorProfileResponse | undefined,
  isLoading: boolean,
  isFollowing: boolean,
  toggleFollow: () => void,
}

// useWalletBalance()
{
  data: WalletBalance | undefined,
  isLoading: boolean,
}

// useLike()
{
  mutate: ({ postId, liked }) => void,
  isPending: boolean,
}

// useUpload()
{
  pickAndUpload: (options?) => Promise<{ uri, url } | null>,
  uploadFromUri: (uri, mimeType?) => Promise<string>,
  isUploading: boolean,
}

// useCreatePost()
{
  mutate: ({ postType, caption?, mediaUrl? }) => void,
  isPending: boolean,
}

// useKyc()
{
  mutate: ({ tokenSymbol, applicationText }) => void,
  isPending: boolean,
}
```

### Style Token Usage Pattern
```typescript
// ALWAYS import from these paths:
import { COLORS, SPACING, RADII, SHADOWS } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { LAYOUTS } from '@/styles/layouts';

// NEVER hardcode colors, spacing, or font sizes
// Use spread for typography in StyleSheet:
const styles = StyleSheet.create({
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
});
```

### Available Typography Variants
`h1` (32px), `h2` (24px), `h3` (20px), `body` (16px), `bodySmall` (14px), `caption` (12px), `label` (12px uppercase), `mono` (14px monospace), `monoLarge` (24px monospace)

### Available Color Tokens
Primary: `primary`, `primaryDark`, `primaryLight`, `primaryMuted`
Backgrounds: `background`, `backgroundSecondary`, `backgroundTertiary`, `surface`, `surfaceElevated`
Text: `textPrimary`, `textSecondary`, `textTertiary`, `textInverse`
Semantic: `success`, `error`, `warning`, `info`
Utility: `border`, `borderLight`, `divider`, `overlay`, `transparent`
Market: `marketGreen`, `marketRed`

### API Response Shape
```typescript
// Success: { success: true, data: { ... } }
// Error:   { success: false, error: "message" }
// Auth: Bearer token in Authorization header
```

### Import Conventions
```typescript
// Mobile app:
import { Text, Button, Avatar } from '@/components/primitives';
import { PostCard, TickerBanner } from '@/components/features';
import { useFeed, useCreatorProfile } from '@/hooks';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';
import { apiService } from '@/services/api';
import { useLocation } from '@/providers/LocationProvider';
import { formatNumber, formatTimeAgo } from '@/utils/formatters';
import type { PostWithCreator, User } from '@momento/shared';
import { UserRole, KycStatus, PostType } from '@momento/shared';

// API:
import { prisma } from '@/lib/prisma';
import { requireAuth, getAuthUser } from '@/lib/auth';
import { getOrSetCache, invalidateCache } from '@/lib/redis';
```

## Common Tasks and How to Do Them

### Add a new API endpoint
1. Create `apps/api/app/api/<resource>/route.ts`
2. Import auth from `@/lib/auth`
3. Follow `try/catch` pattern with `{ success, data }` response shape
4. Add cache keys to `@/lib/redis` if caching needed
5. Update shared types in `packages/shared/src/types.ts` if new response shape

### Add a new screen
1. Create file in `apps/mobile/app/<name>.tsx`
2. Register in `apps/mobile/app/_layout.tsx` Stack.Screen
3. Import components from `@/components`
4. Import styles from `@/styles/theme` and `@/styles/typography`
5. Use hooks from `@/hooks` for data

### Add a new hook
1. Create `apps/mobile/src/hooks/use<Name>.ts`
2. Use `useQuery` or `useMutation` from `@tanstack/react-query`
3. Import `apiService` from `@/services/api`
4. Export from `apps/mobile/src/hooks/index.ts`
5. Add optimistic updates for mutations

### Add a new component
1. Primitive: `apps/mobile/src/components/primitives/<Name>.tsx`
2. Feature: `apps/mobile/src/components/features/<Name>.tsx`
3. Export from the relevant `index.ts`
4. Use `COLORS`, `SPACING`, `TYPOGRAPHY` from styles
5. Use primitives (Text, Button, Avatar) instead of raw RN components

### Add a new shared type
1. Edit `packages/shared/src/types.ts`
2. Export from `packages/shared/src/index.ts` (already uses `export *`)
3. Import in consumers: `import type { NewType } from '@momento/shared'`

## Known Issues to Fix

> Read [GAPS.md](./GAPS.md) for the full audit with exact code, line numbers, and fix strategies.

### Fixed (Phase 5A — C1-C7 API Contract)
- ~~C1: API response envelope not unwrapped~~ FIXED
- ~~C2: Upload presigned URL field name mismatch~~ FIXED
- ~~C3: Push token registration wrong path and payload~~ FIXED
- ~~C4: KYC route does not exist~~ FIXED
- ~~C5: Follow/unfollow HTTP method mismatch~~ FIXED
- ~~C6: Like/unlike HTTP method mismatch~~ FIXED
- ~~C7: Post detail has no direct API fetch~~ FIXED

### Fixed (Phase 4)
- ~~Error boundaries~~ ErrorBoundary component wrapping Stack navigator
- ~~Loading states~~ FeedSkeleton + ProfileSkeleton components
- ~~Settings sheet~~ SettingsSheet overlay on profile (sub-screens are stubs)
- ~~Auth tokens not sent to API~~ AuthBridge provider
- ~~Feed parameter name mismatch~~ useFeed uses correct `lat`/`lng`/`radius`

### Still Open (Major Gaps)
1. **Explore screen**: Should call `/creators/nearby` API for the CREATORS tab, currently derives creators from feed posts (M1)
2. **Comments are hardcoded dummies**: No API fetch for comments, no comment creation (M3, M4, m16)
3. **User location never synced to server** (M5)
4. **Creator application flow incomplete** — Veriff redirect not handled (M6)
5. **No deep linking / URL scheme** (M7)

### Other Known Issues
6. **Privy SDK**: `@privy-io/expo` API may have changed; verify `usePrivy()` returns `{ login, user, isReady, getAccessToken }`
7. **Asset placeholders**: notification-icon.png and adaptive-icon.png are 1x1 transparent PNGs
8. **Image compression**: No compression before upload; should add `expo-image-manipulator`

## Bugs Fixed (2026-03-06)

1. **Auth tokens not sent to API** (CRITICAL): `apiService.setTokenGetter()` was never called.
   - **Fix**: Created `AuthBridge` provider (`src/providers/AuthBridge.tsx`) that sits inside `PrivyProvider` and wires `getAccessToken` into the API service on mount.
   - Provider nesting now: GestureHandler > SafeArea > Query > Privy > **AuthBridge** > Location > Notification

2. **Feed parameter name mismatch** (CRITICAL): `useFeed` sent `latitude`/`longitude`/`radiusKm` but API expected `lat`/`lng`/`radius`.
   - **Fix**: Updated `useFeed.ts` to use `lat`/`lng`/`radius` matching the API route.

## Environment Variables Required

> See `apps/api/.env.local.example` for the template. All lib modules use lazy init, so only DATABASE_URL + Privy are strictly required for local dev.

### API (`apps/api/.env.local`) — 14 variables
```
DATABASE_URL=                    # Supabase PostgreSQL (transaction mode, port 6543)
DIRECT_URL=                      # Supabase PostgreSQL (session mode, port 5432)
NEXT_PUBLIC_PRIVY_APP_ID=        # Privy application ID
PRIVY_APP_SECRET=                # Privy application secret
UPSTASH_REDIS_REST_URL=          # Upstash Redis REST URL (optional for dev)
UPSTASH_REDIS_REST_TOKEN=        # Upstash Redis REST token (optional for dev)
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL (for file uploads)
SUPABASE_SERVICE_ROLE_KEY=       # Supabase service role key (for file uploads)
HELIUS_API_KEY=                  # Helius Solana RPC key (optional for dev)
VERIFF_API_KEY=                  # Veriff KYC API key (optional — use SKIP_KYC)
VERIFF_SHARED_SECRET=            # Veriff webhook HMAC secret (optional — use SKIP_KYC)
NEXT_PUBLIC_API_URL=             # API URL for Veriff webhook callback
SKIP_KYC=true                    # Set to true to bypass KYC in dev
```

### Mobile (`apps/mobile/.env`) — 4 variables
```
EXPO_PUBLIC_API_URL=             # API base URL with /api suffix (e.g., http://192.168.1.100:3000/api)
EXPO_PUBLIC_PRIVY_APP_ID=        # Same Privy app ID as API
EXPO_PUBLIC_SOLANA_RPC_URL=      # Solana RPC endpoint (default: https://api.devnet.solana.com)
EXPO_PUBLIC_SOLANA_NETWORK=      # devnet or mainnet-beta (default: devnet)
```

## Phase 2 Roadmap (Not Yet Started)
1. Price oracle integration (Jupiter/Birdeye API)
2. Token swap execution (Jupiter aggregator)
3. Creator token minting (Solana program)
4. Real-time price charts (WebSocket or polling)
5. Admin dashboard (or keep using Supabase Dashboard)
6. Advanced analytics (post reach, engagement)
7. Auth sync cron job (sync Privy users periodically)
8. Image compression before upload (M9 in GAPS.md)
9. Offline support via React Query persistence (M8 in GAPS.md)
