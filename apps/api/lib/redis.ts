import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) {
      throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables');
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

// ─── Cache Key Generators ───────────────────────────────────────────────────

export const cacheKeys = {
  feed: (lat: number, lng: number, radiusKm: number, sort: string, cursor?: string) =>
    `feed:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}:${sort}:${cursor || 'first'}`,

  nearbyCreators: (lat: number, lng: number, radiusKm: number) =>
    `creators:nearby:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`,

  creatorProfile: (id: string) => `creator:${id}`,

  creatorPosts: (id: string, cursor?: string) =>
    `creator:${id}:posts:${cursor || 'first'}`,

  userProfile: (id: string) => `user:${id}`,

  walletBalance: (userId: string, chain: string = 'solana') => `wallet:balance:${chain}:${userId}`,

  postDetail: (id: string) => `post:${id}`,

  postComments: (postId: string, cursor?: string) =>
    `post:${postId}:comments:${cursor || 'first'}`,

  creatorLeaderboard: () => 'creators:leaderboard',

  priceHistory: (coinId: string, range: string) => `price:history:${coinId}:${range}`,

  walletTransactions: (userId: string, chain: string, cursor?: string | null) =>
    `wallet:txs:${chain}:${userId}:${cursor || 'first'}`,
};

// ─── TTLs (in seconds) ─────────────────────────────────────────────────────

export const cacheTTL = {
  feed: 60,             // 1 minute
  nearbyCreators: 120,  // 2 minutes
  creatorProfile: 300,  // 5 minutes
  creatorPosts: 120,    // 2 minutes
  userProfile: 300,     // 5 minutes
  walletBalance: 30,    // 30 seconds
  postDetail: 300,      // 5 minutes
  postComments: 60,     // 1 minute
  creatorLeaderboard: 300, // 5 minutes
};

// ─── Cache Helpers ──────────────────────────────────────────────────────────

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const cached = await getRedis().get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch (error) {
    console.error('Redis GET error:', error);
  }

  const data = await fetcher();

  try {
    await getRedis().set(key, data, { ex: ttlSeconds });
  } catch (error) {
    console.error('Redis SET error:', error);
  }

  return data;
}

export async function invalidateCache(...patterns: string[]): Promise<void> {
  try {
    const redis = getRedis();
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Use SCAN with large COUNT to reduce round trips, pipeline batch deletes
        let cursor: string | number = 0;
        do {
          const result: [string, string[]] = await redis.scan(cursor, { match: pattern, count: 100 });
          cursor = result[0];
          const keys: string[] = result[1];
          if (keys.length > 0) {
            const pipeline = redis.pipeline();
            keys.forEach((key: string) => pipeline.del(key));
            await pipeline.exec();
          }
        } while (String(cursor) !== '0');
      } else {
        await redis.del(pattern);
      }
    }
  } catch (error) {
    console.error('Redis invalidation error:', error);
  }
}
