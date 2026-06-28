/**
 * Phase 3B mobile wire types — the SINGLE types file for the token economy.
 *
 * Mirrors the backend JSON in docs/solana-migration/design/phase3/CONTRACTS-P3A.md
 * §d exactly: money = base-unit STRINGS, usd = number, bps = number, unix seconds
 * = number. Re-uses @momento/shared enums where present.
 */

// Re-exported from shared so screens have a single import surface.
export { PoolType, TradeSide, VestingStatus } from '@momento/shared';

export type TradeVenue = 'METEORA_DBC' | 'METEORA_DAMM_V2';
export type TradeSideStr = 'buy' | 'sell';

/** d.2 — GET /tokens/[mint] */
export interface TokenDetailResponse {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  status: string;
  venue: TradeVenue;
  poolType: string | null;
  poolAddress: string | null;
  priceUsd: number;
  marketCapUsd: number;
  transferFeeBps: number;
  feeConfig: {
    creatorBps: number;
    momentoBps: number;
    rebateTargetBps: number;
    rebateMint: string;
  };
  fundraise: {
    status: string;
    raisedBaseUnits: string;
    thresholdBaseUnits: string;
    progressPct: number;
    quoteMint: string;
  } | null;
  creator: { id: string; username: string | null; verified: boolean };
  graduatedAt: number | null;
}

/** d.1 — POST /tokens/launch request */
export interface LaunchTokenRequest {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  totalSupply?: string;
  decimals?: number;
  transferFeeBps?: number;
  feeSplit?: { creatorBps: number; partnerBps: number };
  fundraise: {
    targetUsd: number;
    initialMarketCapUsd?: number;
    partnerLockedLpPct?: number;
    partnerLpPct?: number;
    creatorLockedLpPct?: number;
    creatorLpPct?: number;
  };
}

/** d.1 — POST /tokens/launch response (server-signed default; alt path adds `transaction`). */
export interface LaunchTokenResponse {
  tokenId: string;
  mintAddress: string;
  dbcConfigKey: string;
  dbcPoolAddress: string;
  poolType: 'METEORA_DBC';
  status: 'DEPLOYING' | 'ACTIVE';
  configSignature: string;
  poolSignature: string;
  transaction?: string;
}

/** d.3 — quote portion of the build response. */
export interface TradeQuoteWire {
  expectedOutBase: string;
  minOutBase: string;
  priceUsd: number;
  priceTs: string;
  feeBase: string;
  feeBps: number;
  effectiveFeeBps: number;
  inAppRebateBase: string;
  rebateMint: string;
}

/** d.3 — POST /tokens/[mint]/{buy,sell} request */
export interface TradeOrderRequest {
  amountInBase: string;
  inputMint?: string;
  slippageBps?: number;
}

/** d.3 — POST /tokens/[mint]/{buy,sell} response (build == quote, single call). */
export interface TradeBuildResponse {
  intentId: string;
  transaction: string;
  idempotencyKey: string;
  venue: TradeVenue;
  quote: TradeQuoteWire;
}

/** d.4 — POST /tokens/[mint]/{buy,sell}/submit request. transaction = CLIENT-SIGNED base64. */
export interface TradeSubmitRequest {
  intentId: string;
  transaction: string;
  idempotencyKey: string;
}

/** d.4 — POST /tokens/[mint]/{buy,sell}/submit response. */
export interface TradeSubmitResponse {
  intentId: string;
  signature: string;
  venue: TradeVenue;
  status: 'CONFIRMED' | 'PENDING';
  deduped: boolean;
}

/** d.7 — POST /vesting/create request */
export interface VestingCreateRequest {
  kind: 'vesting' | 'lock';
  tokenId: string;
  mint: string;
  recipient: string;
  amountBase: string;
  cliffAmountBase?: string;
  startAt: number;
  cliffAt: number;
  endAt: number;
  unlockEvery: number;
}

/** d.7 — POST /vesting/create response */
export interface VestingCreateResponse {
  vestingId: string;
  provider: string;
  streamId: string;
  signMode: 'client' | 'server';
  transaction?: string;
  createSignature?: string | null;
  netDepositBase: string;
}

/** d.8 — GET /vesting/list row. kind/decimals are TODO(contract): default vesting/9. */
export interface VestingListItem {
  vestingId: string;
  mint: string;
  symbol: string;
  role: 'recipient' | 'sender';
  totalBase: string;
  withdrawnBase: string;
  claimableBase: string;
  cliffAt: number;
  endAt: number;
  status: string;
  kind?: 'vesting' | 'lock';
  decimals?: number;
}

/** d.9 — POST /vesting/[id]/withdraw response (no submit endpoint; sign-and-send). */
export interface VestingWithdrawResponse {
  transaction: string;
  claimableBase: string;
}

/** POST /vesting/[id]/confirm response — backend re-derives state from chain. */
export interface VestingConfirmResponse {
  vestingId: string;
  status: string;
  releasedBase: string;
  totalBase: string;
  claimableBase: string;
}

// ── §2.1 best-effort feeds (gated by ENV.FEES_FEED_ENABLED) ──

export interface TradeFeedItem {
  side: 'BUY' | 'SELL';
  amountInBase: string;
  amountOutBase: string;
  priceUsd: number;
  signature: string;
  blockTime: string | null;
  traderWallet: string;
}

export interface TokenFeesResponse {
  creatorClaimableBase: string;
  momentoClaimableBase: string;
  totalRebatedBase: string;
  quoteMint: string;
}

export interface CreatorFeesResponse {
  totalClaimedBase: string;
  totalClaimableBase: string;
  quoteMint: string;
  perToken: { mint: string; symbol: string; claimableBase: string }[];
}
