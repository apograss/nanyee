/**
 * Batched view-count incrementor.
 *
 * Instead of issuing one UPDATE per page render, we accumulate increments
 * in memory and flush them every FLUSH_INTERVAL_MS (or when the batch reaches
 * MAX_BATCH_SIZE).  This dramatically reduces write pressure on the DB for
 * popular articles while keeping view counts reasonably up-to-date.
 */

import { prisma } from "@/lib/prisma";

const FLUSH_INTERVAL_MS = 15_000; // 15 seconds
const MAX_BATCH_SIZE = 50;

const pending = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (pending.size === 0) return;

  const batch = new Map(pending);
  pending.clear();

  const updates = Array.from(batch.entries()).map(([id, count]) =>
    prisma.article.update({
      where: { id },
      data: { viewCount: { increment: count } },
    }),
  );

  try {
    await prisma.$transaction(updates);
  } catch {
    // On failure, re-add the counts so they aren't lost
    for (const [id, count] of batch) {
      pending.set(id, (pending.get(id) ?? 0) + count);
    }
  }
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);
}

/**
 * Record a single page view. The actual DB write is batched.
 */
export function recordView(articleId: string) {
  pending.set(articleId, (pending.get(articleId) ?? 0) + 1);

  if (pending.size >= MAX_BATCH_SIZE) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flush().catch(() => {});
  } else {
    scheduleFlush();
  }
}
