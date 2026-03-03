import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  fts5Initialized: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Ensure FTS5 virtual table and triggers exist.
 * Called lazily on first search_knowledge invocation.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
export async function ensureFTS5(): Promise<void> {
  if (globalForPrisma.fts5Initialized) return;

  try {
    // Create FTS5 virtual table
    await prisma.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(
        title, summary, content, slug UNINDEXED, article_id UNINDEXED
      )
    `);

    // Trigger: sync on INSERT (published only)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS article_fts_ai AFTER INSERT ON Article
      WHEN new.status = 'published'
      BEGIN
        INSERT INTO article_fts(title, summary, content, slug, article_id)
        VALUES (new.title, COALESCE(new.summary, ''), new.content, new.slug, new.id);
      END
    `);

    // Trigger: sync on DELETE
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS article_fts_ad AFTER DELETE ON Article BEGIN
        DELETE FROM article_fts WHERE article_id = old.id;
      END
    `);

    // Trigger: sync on UPDATE (remove old, insert if published)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS article_fts_au AFTER UPDATE ON Article BEGIN
        DELETE FROM article_fts WHERE article_id = old.id;
        INSERT INTO article_fts(title, summary, content, slug, article_id)
        SELECT new.title, COALESCE(new.summary, ''), new.content, new.slug, new.id
        WHERE new.status = 'published';
      END
    `);

    // Backfill: insert all published articles not yet in FTS
    await prisma.$executeRawUnsafe(`
      INSERT OR IGNORE INTO article_fts(title, summary, content, slug, article_id)
      SELECT title, COALESCE(summary, ''), content, slug, id
      FROM Article WHERE status = 'published'
    `);

    globalForPrisma.fts5Initialized = true;
  } catch (err) {
    console.error("[FTS5] Initialization failed:", err);
    // Don't set initialized flag so it retries next time
  }
}
