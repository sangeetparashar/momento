import { z } from 'zod';

export const createPostSchema = z.object({
  postType: z.enum(['TEXT', 'IMAGE', 'VIDEO']),
  content: z.string().max(5000).optional().nullable(),
  caption: z.string().max(2200).optional().nullable(),
  mediaUrl: z.string().url().optional().nullable(),
  mediaUrls: z.array(z.string().url()).max(10).optional().nullable(),
  latitude: z.number().min(-90).max(90).default(0),
  longitude: z.number().min(-180).max(180).default(0),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

// Transform empty strings to undefined so optional fields pass validation
const emptyToUndefined = (val: string | undefined) => (val === '' ? undefined : val);

export const updateProfileSchema = z.object({
  username: z.preprocess(emptyToUndefined, z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional()),
  displayName: z.preprocess(emptyToUndefined, z.string().min(1).max(50).optional()),
  bio: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  avatarUrl: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  bannerUrl: z.preprocess(emptyToUndefined, z.string().url().optional().nullable()),
  tokenSymbol: z.preprocess(emptyToUndefined, z.string().min(2).max(10).regex(/^[A-Z0-9]+$/, 'Token symbol must be uppercase letters and numbers').optional()),
  socialLinks: z.object({
    instagram: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    twitter: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    youtube: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    spotify: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
    soundcloud: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    tiktok: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
    website: z.preprocess(emptyToUndefined, z.string().url().max(200).optional()),
  }).optional().nullable(),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const pushTokenSchema = z.object({
  pushToken: z.string().min(1),
});

export const uploadPresignSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  folder: z.string().max(255).regex(/^[a-zA-Z0-9_\/-]*$/, 'Invalid folder characters').optional(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal('DELETE'),
});

// ── Phase 2 token-economy schemas (T-fees, CONTRACTS §e.1/e.2) ──

/**
 * Helius enhanced-tx webhook payload: a lax ARRAY of objects. Helius posts many
 * optional fields, so each element is `.loose()`-ed (unknown keys pass through)
 * and only the keys we actually read are loosely typed. Real parsing /
 * normalization happens in `lib/helius-webhook.ts#parseHeliusBatch`; this schema
 * only guards the shape. (`.loose()` is the zod v4 canonical name for the
 * previously-deprecated `.passthrough()` alias — REVIEW-correctness P2-1.)
 */
export const heliusWebhookSchema = z.array(
  z
    .object({
      signature: z.string().optional(),
      slot: z.number().optional(),
      timestamp: z.number().optional(),
      type: z.string().optional(),
      source: z.string().optional(),
      accountData: z.array(z.any()).optional(),
      tokenTransfers: z.array(z.any()).optional(),
      events: z.any().optional(),
    })
    .loose(),
);

/**
 * Query params for the public trade/fee summary endpoints (§e.2/e.3).
 *   range       — time window (default 24H)
 *   granularity — optional series bucketing (hour|day)
 *   limit       — recent-trades cap (default 50, max 200)
 */
export const tradeRangeSchema = z.object({
  range: z.enum(['24H', '7D', '1M', '3M', '1Y', 'ALL']).default('24H'),
  granularity: z.enum(['hour', 'day']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ── Route param validators (REVIEW-security P1) ──
// Bound `[mint]` / `[id]` BEFORE any DB or cache use so attacker-controlled
// unbounded strings cannot become cache keys / enumeration probes.

// Base58 alphabet (no 0, O, I, l); a Solana mint is 32–44 base58 chars.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// uuid v4-ish (the schema uses `@default(uuid())`).
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** True if `mint` looks like a Solana base58 mint address. */
export function isValidMint(mint: string | null | undefined): boolean {
  return typeof mint === 'string' && BASE58_RE.test(mint);
}

/** True if `id` looks like a uuid (the user/creator id format). */
export function isValidUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

// Helper to validate and return parsed data or error response
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return {
      success: false,
      response: new Response(
        JSON.stringify({ success: false, error: `Validation error: ${errors}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { success: true, data: result.data };
}
