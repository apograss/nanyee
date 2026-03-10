/**
 * LRU Cache for wiki search results.
 * In-memory, 200 entries max, 10-minute TTL.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 200;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  // Move to end (LRU refresh)
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as T;
}

export function setCached<T>(key: string, value: T): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Clear all wiki search cache entries (call on article mutations). */
export function clearWikiSearchCache(): void {
  cache.clear();
}
