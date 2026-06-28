/**
 * Typed wrappers around `apiService` for the Phase 3B token-economy endpoints.
 *
 * `apiService.get/post` already inject the bearer, unwrap the { success, data }
 * envelope, and throw `ApiError`. These wrappers add nothing but types + the
 * exact endpoint path — never re-wrap or re-handle errors here.
 *
 * Endpoint mapping: docs/solana-migration/design/phase3/CONTRACTS-P3A.md §d.
 */
import { apiService } from '@/services/api';
import type * as P3 from './tokenApi.types';

/** d.2 */
export const getTokenDetail = (mint: string) =>
  apiService.get<P3.TokenDetailResponse>(`/tokens/${mint}`);

/** d.1 */
export const launchToken = (body: P3.LaunchTokenRequest) =>
  apiService.post<P3.LaunchTokenResponse>('/tokens/launch', body);

/** d.3 — build == quote (returns unsigned tx + intentId + quote in one call). */
export const buildTrade = (
  mint: string,
  side: 'buy' | 'sell',
  b: P3.TradeOrderRequest,
) => apiService.post<P3.TradeBuildResponse>(`/tokens/${mint}/${side}`, b);

/** d.4 — relay the CLIENT-SIGNED transaction. */
export const submitTrade = (
  mint: string,
  side: 'buy' | 'sell',
  b: P3.TradeSubmitRequest,
) => apiService.post<P3.TradeSubmitResponse>(`/tokens/${mint}/${side}/submit`, b);

/** d.7 */
export const createVesting = (body: P3.VestingCreateRequest) =>
  apiService.post<P3.VestingCreateResponse>('/vesting/create', body);

/** d.8 */
export const listVesting = (p?: { role?: 'recipient' | 'sender'; mint?: string }) =>
  apiService.get<P3.VestingListItem[]>('/vesting/list', p);

/** d.9 — returns an unsigned tx; no submit endpoint (sign-and-send). */
export const withdrawVesting = (id: string) =>
  apiService.post<P3.VestingWithdrawResponse>(`/vesting/${id}/withdraw`, {});

/**
 * Confirm a self-submitted vesting tx (create CLIENT path / withdraw). The client
 * signs-and-sends itself, then posts the landed signature here so the backend
 * re-derives funded/withdrawn from chain and transitions the row's status
 * (PENDING→ACTIVE on a confirmed create; →COMPLETED when fully withdrawn).
 */
export const confirmVesting = (id: string, signature: string) =>
  apiService.post<P3.VestingConfirmResponse>(`/vesting/${id}/confirm`, { signature });

// ── gated §2.1 feeds (not in binding §d; hooks gate on ENV.FEES_FEED_ENABLED) ──

export const getTokenTrades = (
  mint: string,
  p?: { limit?: number; cursor?: string },
) => apiService.get<P3.TradeFeedItem[]>(`/tokens/${mint}/trades`, p);

export const getTokenFees = (mint: string) =>
  apiService.get<P3.TokenFeesResponse>(`/tokens/${mint}/fees`);

export const getCreatorFees = (creatorId: string) =>
  apiService.get<P3.CreatorFeesResponse>(`/creators/${creatorId}/fees`);
