import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// ─── Redis instance for rate limiting ────────────────────────────────────────

let _redis: Redis | null = null;
function getRateLimitRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  _redis = new Redis({ url, token });
  return _redis;
}

// ─── Rate Limiter Factory ────────────────────────────────────────────────────

function createLimiter(tokens: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]) {
  const redis = getRateLimitRedis();
  if (!redis) return null;

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: true,
    prefix: 'momento:ratelimit',
  });
}

// ─── Rate Limiters ───────────────────────────────────────────────────────────

export const authLimiter = createLimiter(5, '1 m');
export const readLimiter = createLimiter(60, '1 m');
export const writeLimiter = createLimiter(30, '1 m');
export const postCreateLimiter = createLimiter(5, '1 h');
export const commentLimiter = createLimiter(20, '1 m');
export const kycLimiter = createLimiter(1, '1 h');
export const uploadLimiter = createLimiter(10, '1 m');

// ─── Identifier Extraction ──────────────────────────────────────────────────

function getIdentifier(request: NextRequest): string {
  // Use first 32 chars of Authorization token if present
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token.length > 0) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        const userId = payload.sub || payload.userId || payload.sid;
        if (userId) return `auth:${userId}`;
      } catch {
        // Fall through to token prefix if JWT decode fails
      }
      return `auth:${token.substring(0, 32)}`;
    }
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return `ip:${forwarded.split(',')[0].trim()}`;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return `ip:${realIp}`;
  }

  return 'ip:unknown';
}

// ─── Apply Rate Limit Helper ─────────────────────────────────────────────────

/**
 * Checks rate limit for the request. Returns a 429 Response if exceeded,
 * or null if the request is allowed. If Redis is unavailable (limiter is null),
 * all requests are allowed (graceful degradation).
 */
export async function applyRateLimit(
  request: NextRequest,
  limiter: Ratelimit | null
): Promise<NextResponse | null> {
  // Graceful degradation: if Redis is not configured, allow all requests
  if (!limiter) return null;

  const identifier = getIdentifier(request);

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(retryAfter, 1)),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(reset),
          },
        }
      );
    }

    return null;
  } catch (error) {
    // If rate limiting fails (Redis down, network issue), allow the request
    console.error('Rate limit check failed:', error);
    return null;
  }
}
