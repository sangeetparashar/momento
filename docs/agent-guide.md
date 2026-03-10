# Momento - Agent Handoff Guide

## Purpose
This document gives any future AI agent full context to pick up work on this codebase without losing any knowledge from the initial build session.

## Current State (as of 2026-03-10, all implementation phases complete)

### What Exists
- Complete monorepo scaffold: turbo + pnpm workspaces
- Full API backend: 17 endpoints, 7 lib modules, Prisma schema, seed script
- Full mobile app: 12 screens, 17 components, 11 hooks, 4 providers
- Shared type package: all interfaces and enums (audited against API responses)
- Landing page: 13 components, waitlist API, Tailwind, deployed on Vercel
  - Momento logo (geometric M mark SVG) + favicon
  - Wide letter-spacing MOMENTO wordmark (matches Figma)
  - Premium CSS animations (float, pulse-glow, shimmer, bounce)
  - Generic reusable Modal component with backdrop blur + slide-up
  - Terms of Service + Privacy Policy displayed in modals (not separate pages)
  - Waitlist signups logged to Vercel function logs (uses /tmp on Vercel)
  - vercel.json with security headers
- Error boundaries + loading skeletons
- Settings sheet overlay with working Delete Account flow
- Animation system: AnimatedPressable, transitions.ts, enhanced PostCard/LikeButton
- AuthBridge provider wiring Privy tokens into API service
- All 7 critical API contract bugs fixed (C1-C7)
- Real comments (fetch + create), nearby creators, location sync, post detail fallback
- Pull-to-refresh on explore/market, KeyboardAvoidingView on forms
- Creator application flow opens Veriff URL
- Deep linking configured (scheme: momento)
- Git: 15 commits on `main`, clean tree

### What Does NOT Exist Yet
- No external services configured (all env vars are placeholders)
- Prisma client not generated (need `pnpm approve-builds` then `npx prisma generate`)
- Placeholder PNG assets (1x1 transparent PNGs)
- No tests, no CI/CD, no ESLint/Prettier config
- No API rate limiting
- No offline support (React Query persistence)
- No image compression before upload
- Comment deletion UI (API exists, no mobile hook/UI)
- Settings sub-screens still stubs (except Delete Account)
- Waitlist storage is ephemeral on Vercel (/tmp) — needs proper DB for persistence
- Market/swap/portfolio features use dummy data (Phase 2 roadmap)

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

> See [GAPS.md](./GAPS.md) for the full audit. See [NEXT_STEPS.md](./NEXT_STEPS.md) for the execution plan.

### Fixed (Phases 1-4, 2026-03-10)
- ~~7 critical API contract bugs (C1-C7)~~ — All resolved
- ~~Explore screen using feed data~~ → Now uses `/creators/nearby` (M1)
- ~~Hardcoded dummy comments~~ → Real fetch + creation (M3, m16)
- ~~User location not synced~~ → LocationProvider syncs to server (M5)
- ~~Creator application flow~~ → Opens Veriff URL via Linking (M6)
- ~~Deep linking~~ → scheme: momento configured (M7)
- ~~Error boundaries + loading skeletons~~ → ErrorBoundary + Skeletons
- ~~Settings sheet~~ → Working Delete Account flow
- ~~Post detail no direct fetch~~ → useQuery fallback (C7)
- ~~Shared types audit~~ → PostWithCreator + PublicCreator updated (M10)
- ~~Pull-to-refresh~~ → explore + market screens (m3)
- ~~KeyboardAvoidingView~~ → create-post + edit-profile (m5)

### Still Open (Agent-Executable)
1. **No tests** — Zero test files exist. Need Jest + RTL for hooks, Playwright or similar for API
2. **No CI/CD** — Need GitHub Actions for lint/type-check/test
3. **No ESLint/Prettier** — Referenced in scripts but not configured
4. **No API rate limiting** — All routes unprotected (m9)
5. **No comment deletion UI** — API route exists, no mobile hook/swipe-to-delete (M4)
6. **No offline support** — React Query has no persistence layer (M8)
7. **No image compression** — Large uploads, should add expo-image-manipulator (M9)
8. **Settings sub-screens** — Account Privacy, Device Permissions, Favorites still stubs (M2)

### Requires Human Intervention
- **Asset placeholders**: notification-icon.png and adaptive-icon.png are 1x1 transparent PNGs
- **Privy SDK**: `@privy-io/expo` API may have changed; verify after service setup
- **Market/swap/portfolio data**: Dummy data — needs Phase 2 price oracle integration

## Bugs Fixed (2026-03-06)

1. **Auth tokens not sent to API** (CRITICAL): `apiService.setTokenGetter()` was never called.
   - **Fix**: Created `AuthBridge` provider (`src/providers/AuthBridge.tsx`) that sits inside `PrivyProvider` and wires `getAccessToken` into the API service on mount.
   - Provider nesting now: GestureHandler > SafeArea > Query > Privy > **AuthBridge** > Location > Notification

2. **Feed parameter name mismatch** (CRITICAL): `useFeed` sent `latitude`/`longitude`/`radiusKm` but API expected `lat`/`lng`/`radius`.
   - **Fix**: Updated `useFeed.ts` to use `lat`/`lng`/`radius` matching the API route.

## Environment Variables Required

### API (`apps/api/.env.local`)
```
DATABASE_URL=              # Supabase PostgreSQL connection string
DIRECT_URL=                # Supabase direct connection (for migrations)
UPSTASH_REDIS_REST_URL=    # Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN=  # Upstash Redis REST token
PRIVY_APP_ID=              # Privy application ID
PRIVY_APP_SECRET=          # Privy application secret
HELIUS_API_KEY=            # Helius Solana RPC key
VERIFF_API_KEY=            # Veriff KYC API key
VERIFF_SHARED_SECRET=      # Veriff webhook secret
SUPABASE_URL=              # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY= # Supabase service role key
SKIP_KYC=true              # Set to true to bypass KYC in dev
```

### Mobile (`apps/mobile/.env` or EXPO_PUBLIC_*)
```
EXPO_PUBLIC_API_URL=       # API base URL (e.g., http://localhost:3000/api)
EXPO_PUBLIC_PRIVY_APP_ID=  # Same Privy app ID
```

## Phase 2 Roadmap (Not Yet Started — Requires External Services)
1. Price oracle integration (Jupiter/Birdeye API)
2. Token swap execution (Jupiter aggregator)
3. Creator token minting (Solana program)
4. Real-time price charts (WebSocket or polling)
5. Admin dashboard (or keep using Supabase Dashboard)
6. Advanced analytics (post reach, engagement)
7. Auth sync cron job (sync Privy users periodically)

## Next Agent Work (No Human Intervention Required)
See `docs/NEXT_STEPS.md` for the full execution plan covering:
- ESLint/Prettier setup, CI/CD pipeline, test suite
- API rate limiting, comment deletion, image compression
- Offline support, settings sub-screens, waitlist persistence
