> ⚠️ SUPERSEDED by the Solana-only migration (2026-06). See docs/solana-migration/README.md. Retained for history.

# Multi-Chain Orchestration Plan: Base Chain + Solana

> **Status**: Planning Complete
> **Scope**: Add Base Chain (Ethereum L2) support alongside existing Solana
> **Approach**: Multi-chain (Option B) — both chains coexist

---

## End Result

- **OAuth users** (Google/Instagram) → get **both** Solana AND Base embedded wallets
- **Wallet screen** → **dropdown switcher** to toggle between Solana and Base
- **Phantom / MWA login** → Solana wallet only
- **WalletConnect / Base wallet login** → Base wallet only
- All wallet operations (balance, swap, send, fund) → **chain-aware**

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chain identifier | `type ChainType = 'solana' \| 'base'` | Simple union type, JSON-serializable |
| Database | Add `baseWalletAddress` + `primaryChain` fields | Backward-compatible, nullable |
| API convention | `?chain=solana\|base` query param | RESTful, defaults to solana |
| Mobile state | `ChainContext` provider + AsyncStorage | Persists across restarts |
| Balance fetching (Base) | Direct RPC + optional Alchemy | No mandatory API key |
| Swap provider (Base) | 0x API | REST-based like Jupiter, supports Base |
| Send transactions (Base) | Raw EVM tx params via Privy ETH provider | No ethers.js/viem dependency |
| Wallet creation | Privy embedded wallets for both chains | `createOnLogin: 'users-without-wallets'` |
| External login (Base) | SIWE (Sign In With Ethereum) via Privy | Mirrors existing SIWS flow |

---

## Agent Architecture

### 10 Agents, 4 Phases

```
PHASE 1 — Foundation (parallel, no dependencies)
├── Agent 1: Shared Types & Constants        → packages/shared/
├── Agent 2: Database Schema & Server Auth   → apps/api/prisma/, apps/api/lib/auth.ts
└── Agent 3: Environment & Config            → apps/api/.env*, apps/mobile/src/config/

PHASE 2 — Backend (parallel, depends on Phase 1)
├── Agent 4: Base Balance Library + Route    → apps/api/lib/base.ts (NEW), balance route
├── Agent 5: Base Swap Library + Route       → apps/api/lib/base-swap.ts (NEW), swap route
├── Agent 6: Base Send + Onramp Routes       → send route, onramp route
└── Agent 7: History & Snapshots Routes      → history route, snapshots route

PHASE 3 — Mobile (parallel, depends on Phase 1 + 2)
├── Agent 8: Mobile Auth + Chain Context     → useAuth.ts, ChainProvider (NEW), login.tsx
├── Agent 9: Mobile Wallet UI + Switcher     → wallet.tsx, ChainSwitcher (NEW)
└── Agent 10: Mobile Swap/Send/Fund Modals   → SwapModal, SendModal, FundWalletModal

PHASE 4 — Integration (sequential, depends on all above)
└── Orchestrator: Merge, dependency audit, E2E verification
```

### Detailed Agent Instructions

Each agent has a dedicated document with:
- **Mission** and scope
- **Prerequisites** (which agents must be merged first)
- **Files to read** before making changes
- **Step-by-step implementation** with code snippets
- **Research required** (things the agent must look up)
- **Verification checklist** (how to confirm correctness)
- **Commit message** template

| Agent | Document | Key Files Created/Modified |
|-------|----------|---------------------------|
| 1 | [docs/multi-chain/01-agent1-shared-types.md](docs/multi-chain/01-agent1-shared-types.md) | `packages/shared/src/types.ts`, `constants.ts` |
| 2 | [docs/multi-chain/02-agent2-database-auth.md](docs/multi-chain/02-agent2-database-auth.md) | `prisma/schema.prisma`, `lib/auth.ts` |
| 3 | [docs/multi-chain/03-agent3-env-config.md](docs/multi-chain/03-agent3-env-config.md) | `config/env.ts`, `.env.*` files |
| 4 | [docs/multi-chain/04-agent4-base-balance.md](docs/multi-chain/04-agent4-base-balance.md) | `lib/base.ts` (NEW), `balance/route.ts` |
| 5 | [docs/multi-chain/05-agent5-base-swap.md](docs/multi-chain/05-agent5-base-swap.md) | `lib/base-swap.ts` (NEW), `swap/route.ts` |
| 6 | [docs/multi-chain/06-agent6-base-send-onramp.md](docs/multi-chain/06-agent6-base-send-onramp.md) | `send/route.ts`, `onramp/route.ts` |
| 7 | [docs/multi-chain/07-agent7-history-snapshots.md](docs/multi-chain/07-agent7-history-snapshots.md) | `history/route.ts`, `snapshots/route.ts` |
| 8 | [docs/multi-chain/08-agent8-mobile-auth.md](docs/multi-chain/08-agent8-mobile-auth.md) | `useAuth.ts`, `ChainProvider.tsx` (NEW), `login.tsx` |
| 9 | [docs/multi-chain/09-agent9-wallet-ui.md](docs/multi-chain/09-agent9-wallet-ui.md) | `wallet.tsx`, `ChainSwitcher.tsx` (NEW) |
| 10 | [docs/multi-chain/10-agent10-mobile-modals.md](docs/multi-chain/10-agent10-mobile-modals.md) | `SwapModal.tsx`, `SendModal.tsx`, `FundWalletModal.tsx` |
| Integration | [docs/multi-chain/11-phase4-integration.md](docs/multi-chain/11-phase4-integration.md) | Cross-cutting verification |

---

## Merge Strategy

### Phase 1 Merge Order
Agents 1, 2, 3 can merge in **any order** — they touch different files:
- Agent 1: `packages/shared/` only
- Agent 2: `apps/api/prisma/` + `apps/api/lib/auth.ts` only
- Agent 3: `.env*` + `config/env.ts` only

### Phase 2 Merge Order
Agents 4-7 can merge in **any order** — they primarily create NEW files:
- Agent 4: Creates `lib/base.ts`, modifies `balance/route.ts`
- Agent 5: Creates `lib/base-swap.ts`, modifies `swap/route.ts`
- Agent 6: Modifies `send/route.ts` + `onramp/route.ts`
- Agent 7: Modifies `history/route.ts` + `snapshots/route.ts`

**Potential conflict**: Agent 4 and Agent 7 may both modify `redis.ts` cache keys. Resolve by merging Agent 4 first.

### Phase 3 Merge Order
**Agent 8 MUST merge first** — Agents 9 and 10 depend on `ChainProvider` and `useChain`.
Then Agent 9, then Agent 10 (Agent 10 depends on the chain-aware `useWalletBalance` from Agent 9).

### Recommended Full Merge Sequence
```
1. Agent 1 (shared types)
2. Agent 2 (database + auth)
3. Agent 3 (env config)
4. Agent 4 (base balance)
5. Agent 5 (base swap)
6. Agent 6 (base send + onramp)
7. Agent 7 (history + snapshots)
8. Agent 8 (mobile auth + chain context)
9. Agent 9 (wallet UI + switcher)
10. Agent 10 (modals)
11. Phase 4 integration pass
```

---

## Key Contracts Between Agents

These are the shared interfaces that agents must agree on:

```typescript
// ChainType — defined by Agent 1, used by ALL agents
type ChainType = 'solana' | 'base';

// CHAIN_CONFIG — defined by Agent 1, used by Agents 9, 10
CHAIN_CONFIG.solana.symbol  // 'SOL'
CHAIN_CONFIG.base.symbol    // 'ETH'
CHAIN_CONFIG.base.usdcAddress  // '0x833589fCD...'

// API query convention — used by Agents 4-7, consumed by Agents 8-10
GET  /api/wallet/balance?chain=base
GET  /api/wallet/swap?chain=base&sellToken=...&buyToken=...
POST /api/wallet/send     { chain: 'base', ... }
GET  /api/wallet/onramp?chain=base&provider=transak
GET  /api/wallet/history?chain=base&range=7D

// Database — added by Agent 2
User.walletAddress       // Solana (existing, never null)
User.baseWalletAddress   // Base (new, nullable)
User.primaryChain        // 'solana' | 'base' (new, default 'solana')

// Auth helpers — added by Agent 2, used by Agents 4-7
getWalletForChain(user, 'base')  // → string | null
getChainParam(request)            // → 'solana' | 'base'

// Mobile chain context — created by Agent 8, used by Agents 9-10
useChain() → { chain, setChain, availableChains, setAvailableChains }

// Mobile auth — extended by Agent 8, used by Agents 9-10
useAuth() → {
  walletAddress,          // Solana (existing)
  ethWalletAddress,       // Base (new)
  getWalletProvider,      // Solana provider (existing)
  getEthWalletProvider,   // Base provider (new)
}
```

---

## Research Items Summary

These items require online research or SDK verification before implementation:

| # | Item | Agent | Priority |
|---|------|-------|----------|
| 1 | Privy `linkedAccounts` structure for multi-wallet extraction | Agent 2 | Critical |
| 2 | Privy Expo SDK `useEmbeddedEthereumWallet` hook name/API | Agent 8 | Critical |
| 3 | Privy Expo SDK `useLoginWithSiwe` hook availability | Agent 8 | Critical |
| 4 | Privy Expo SDK Ethereum provider `request()` API | Agent 10 | Critical |
| 5 | 0x API Base chain endpoint and params | Agent 5 | High |
| 6 | Base USDC contract address verification | Agent 1 | High |
| 7 | Ramp/MoonPay/Transak Base chain asset codes | Agent 6 | Medium |
| 8 | Alchemy `alchemy_getTokenBalances` on Base | Agent 4 | Medium |
| 9 | WalletConnect React Native integration with Privy | Agent 8 | Low (can defer) |
| 10 | CoinGecko ETH price endpoint verification | Agent 4 | Low |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Privy doesn't support ETH embedded wallet on Expo | Low | Blocker | Check SDK before starting. Privy docs confirm EVM support. |
| 0x API rate limits without API key | Medium | Degraded | Get free API key. Add rate limiting + caching. |
| Merge conflicts between agents | Medium | Delay | Agents create NEW files where possible. Clear merge order. |
| Onramp providers don't support Base | Medium | Partial | Transak likely supports Base. Others can show "Coming Soon". |
| WalletConnect not available in Privy Expo | High | Partial | Defer external Base wallet login to v2. SIWE backend ready. |

---

## New Files Created (Summary)

| File | Agent | Purpose |
|------|-------|---------|
| `apps/api/lib/base.ts` | 4 | Base chain balance fetching (ETH + ERC-20) |
| `apps/api/lib/base-swap.ts` | 5 | Base chain swap via 0x API |
| `apps/mobile/src/providers/ChainProvider.tsx` | 8 | Chain selection context + persistence |
| `apps/mobile/src/hooks/useChain.ts` | 8 | Chain hook re-export |
| `apps/mobile/src/components/features/ChainSwitcher.tsx` | 9 | Dropdown chain selector UI |
| `apps/api/prisma/migrations/*/migration.sql` | 2 | Database migration for new fields |

## Existing Files Modified (Summary)

| File | Agents | Changes |
|------|--------|---------|
| `packages/shared/src/types.ts` | 1 | Add ChainType, chain fields to interfaces |
| `packages/shared/src/constants.ts` | 1 | Add CHAIN_CONFIG |
| `apps/api/prisma/schema.prisma` | 2 | Add baseWalletAddress, primaryChain, chain |
| `apps/api/lib/auth.ts` | 2 | Multi-wallet extraction, helper functions |
| `apps/api/lib/redis.ts` | 4, 7 | Chain-specific cache keys |
| `apps/api/app/api/wallet/balance/route.ts` | 4 | Chain-aware balance |
| `apps/api/app/api/wallet/swap/route.ts` | 5 | Chain-aware swap |
| `apps/api/app/api/wallet/send/route.ts` | 6 | Chain-aware send |
| `apps/api/app/api/wallet/onramp/route.ts` | 6 | Chain-aware onramp |
| `apps/api/app/api/wallet/history/route.ts` | 7 | Chain-aware history |
| `apps/api/app/api/wallet/snapshots/route.ts` | 7 | Chain-aware snapshots |
| `apps/mobile/src/config/env.ts` | 3 | Add BASE_* env vars |
| `apps/mobile/src/hooks/useAuth.ts` | 8 | ETH wallet + SIWE |
| `apps/mobile/src/providers/PrivyGuard.tsx` | 8 | Enable ETH embedded wallet |
| `apps/mobile/app/login.tsx` | 8 | Base wallet login option |
| `apps/mobile/app/_layout.tsx` | 8 | Add ChainProvider |
| `apps/mobile/app/wallet.tsx` | 9 | Chain switcher + dynamic display |
| `apps/mobile/src/hooks/useWalletBalance.ts` | 9 | Chain in query key |
| `apps/mobile/src/hooks/useSwap.ts` | 10 | Chain-aware swap |
| `apps/mobile/src/hooks/useOnramp.ts` | 10 | Chain param |
| `apps/mobile/src/components/features/SwapModal.tsx` | 10 | Base tokens + ETH provider |
| `apps/mobile/src/components/features/SendModal.tsx` | 10 | Base address validation + ETH sends |
| `apps/mobile/src/components/features/FundWalletModal.tsx` | 10 | Base onramp + instructions |
