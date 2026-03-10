/**
 * In-memory rate limiter for wiki edits.
 * Limits: 10 edits per minute per user.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_EDITS = 10;

const store = new Map<string, number[]>();

/** Check if user can edit. Returns { allowed, retryAfterMs }. */
export function checkEditRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let timestamps = store.get(userId) || [];
  // Remove expired entries
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= MAX_EDITS) {
    const oldestInWindow = timestamps[0]!;
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    store.set(userId, timestamps);
    return { allowed: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }

  timestamps.push(now);
  store.set(userId, timestamps);
  return { allowed: true };
}
