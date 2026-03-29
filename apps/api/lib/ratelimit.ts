import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// Lazy Redis singleton (env vars available at request time, not module load)
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) {
      throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

// Lazy limiter cache — created on first use
const _limiters = new Map<string, Ratelimit>();

function getLimiter(
  name: string,
  tokens: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit {
  if (!_limiters.has(name)) {
    _limiters.set(
      name,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(tokens, window),
        prefix: `rl:${name}`,
      }),
    );
  }
  return _limiters.get(name)!;
}

/** KYC apply: 1 request per hour per user */
export function kycLimiter() { return getLimiter('kyc', 1, '1 h'); }

/** Swap: 5 requests per minute per user */
export function swapLimiter() { return getLimiter('swap', 5, '1 m'); }

/** Write operations (POST/PATCH/DELETE): 30 req/min per user */
export function writeLimiter() { return getLimiter('write', 30, '1 m'); }

/** Read operations (GET): 60 req/min per user */
export function readLimiter() { return getLimiter('read', 60, '1 m'); }

/**
 * Check rate limit. Returns 429 response if limited, null if allowed.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<NextResponse | null> {
  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }
    return null;
  } catch {
    // Fail open if Redis is down
    return null;
  }
}

/**
 * Extract rate limit identifier from request. Uses userId or falls back to IP.
 */
export function getRateLimitId(request: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}

/**
 * Convenience: check rate limit using IP from request.
 * Compatible with the old `applyRateLimit(request, limiter)` API.
 */
export async function applyRateLimit(
  request: NextRequest,
  limiterOrFn: Ratelimit | (() => Ratelimit),
  userId?: string,
): Promise<NextResponse | null> {
  const limiter = typeof limiterOrFn === 'function' ? limiterOrFn() : limiterOrFn;
  const id = getRateLimitId(request, userId);
  return checkRateLimit(limiter, id);
}
