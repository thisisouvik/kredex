import { redis } from "./client";

/**
 * Wraps a fetcher function with Upstash Redis caching.
 * @param key The Redis cache key
 * @param ttlSeconds Time-to-live in seconds
 * @param fetcher The async function to fetch data on a cache miss
 * @returns The cached or freshly fetched data
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // If Redis environment variables are missing, bypass cache
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(`Upstash Redis environment variables missing. Bypassing cache for key: ${key}`);
    return fetcher();
  }

  try {
    const cachedData = await redis.get<T>(key);
    if (cachedData !== null) {
      return cachedData;
    }

    const freshData = await fetcher();
    await redis.set(key, freshData, { ex: ttlSeconds });
    return freshData;
  } catch (error) {
    console.error(`Cache error for key ${key}:`, error);
    // On cache failure, fallback to direct fetch
    return fetcher();
  }
}

/**
 * Invalidates a specific cache key.
 * @param key The Redis cache key to delete
 */
export async function invalidateCache(key: string): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return;
  }
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Failed to invalidate cache key ${key}:`, error);
  }
}
