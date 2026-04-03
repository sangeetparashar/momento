# Multi-Chain Orchestration Plan: Base Chain + Solana

## Overview

This plan adds **Base Chain (Ethereum L2)** support alongside the existing Solana integration.

### End Result
- **OAuth users** (Google/Instagram) get **both** a Solana AND a Base embedded wallet via Privy
- **Wallet screen** has a **dropdown switcher** to toggle between Solana and Base views
- **Phantom / MWA login** → user gets **Solana wallet only**
- **WalletConnect / Base wallet login** → user gets **Base wallet only**
- All wallet operations (balance, swap, send, fund) are **chain-aware**

---

## Architecture Decisions

### Chain Identifier
```typescript
type ChainType = 'solana' | 'base';
```

### Database Strategy
- Keep existing `walletAddress` field (Solana, backward-compatible)
- Add new `baseWalletAddress` field (nullable, 0x format)
- Both are `@unique` when present
- Add `primaryChain` field (default: 'solana') for user preference

### API Strategy
- All wallet endpoints accept `?chain=solana|base` query parameter
- Default to `solana` for backward compatibility
- Server resolves the correct wallet address based on chain param + user record

### Mobile Strategy
- New `ChainContext` provider stores selected chain in AsyncStorage
- Wallet screen gets a dropdown selector at the top
- All wallet hooks read from ChainContext to determine which chain to query
- Swap/Send/Fund modals operate on the currently selected chain

### Auth Strategy
- OAuth login → Privy creates both `useEmbeddedSolanaWallet` + `useEmbeddedEthereumWallet`
- Phantom deeplink → SIWS flow → Solana only (no embedded ETH wallet)
- WalletConnect / Coinbase Wallet → SIWE flow → Base only (no embedded SOL wallet)
- External wallet users see only their chain in the wallet screen (no switcher)

---

## Agent Breakdown

The work is divided into **10 agents** across **4 phases**. Each agent works in an **isolated git worktree** and produces a self-contained, mergeable branch.

### Dependency Graph
```
Phase 1 (Foundation) ─── no dependencies, all parallel
  ├── Agent 1: Shared Types & Constants
  ├── Agent 2: Database Schema & Auth
  └── Agent 3: Environment & Config

Phase 2 (Backend) ─── depends on Phase 1 being merged
  ├── Agent 4: Base Balance Library + Route
  ├── Agent 5: Base Swap Library + Route
  ├── Agent 6: Base Send + Onramp Routes
  └── Agent 7: History & Snapshots Routes

Phase 3 (Mobile) ─── depends on Phase 1 + 2 being merged
  ├── Agent 8: Mobile Auth + Chain Context
  ├── Agent 9: Mobile Wallet UI + Chain Switcher
  └── Agent 10: Mobile Swap/Send/Fund Modals

Phase 4 (Integration) ─── depends on all above
  └── Orchestrator: Final merge, dependency cleanup, E2E verification
```

### Key Contracts Between Agents

All agents must respect these shared interfaces:

```typescript
// packages/shared/src/types.ts — added by Agent 1
type ChainType = 'solana' | 'base';

// API query param convention — used by Agents 4-7, consumed by Agents 8-10
// GET /api/wallet/balance?chain=solana
// GET /api/wallet/balance?chain=base
// POST /api/wallet/swap  body: { chain: 'base', ... }
// POST /api/wallet/send  body: { chain: 'base', ... }

// Database fields — added by Agent 2, consumed by Agents 4-7
// User.walletAddress      → Solana address (existing)
// User.baseWalletAddress  → Base/ETH address (new, nullable)
// User.primaryChain       → 'solana' | 'base' (new, default 'solana')

// Mobile chain context — created by Agent 8, consumed by Agents 9-10
// useChain() → { chain: ChainType, setChain, availableChains: ChainType[] }
```
