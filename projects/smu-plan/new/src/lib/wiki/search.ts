/**
 * Shared FTS5-based wiki search service.
 * Used by both AI executor (search_knowledge) and wiki API (GET /api/wiki?q=).
 */

import { prisma, ensureFTS5 } from "@/lib/prisma";
import { getCached, setCached } from "./search-cache";

export interface WikiSearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  snippet: string;
  score: number;
}

/**
 * Build a safe FTS5 MATCH expression from a user query.
 * - Splits into tokens
 * - Wraps each token in quotes to prevent FTS5 syntax injection
 * - Joins with OR for broad matching
 */
function buildSafeMatchExpr(query: string): string {
  const tokens = query
    .split(/[\s,，。？?！!、；;：:·\-/\\()（）【】\[\]]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);

  if (tokens.length === 0) return "";

  // Wrap each token in double-quotes for literal matching
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}

/**
 * Extract a text snippet from content around the first keyword match.
 * Strips markdown formatting.
 */
function extractSnippet(content: string, query: string, maxLen = 300): string {
  // Strip markdown
  const plain = content
    .replace(/[#*_\[\]()>`~|]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  // Find the first keyword occurrence for centering the snippet
  const tokens = query
    .split(/[\s,，。？?！!、；;：:·\-/\\()（）【】\[\]]+/)
    .filter((t) => t.length >= 1);

  let bestPos = 0;
  for (const token of tokens) {
    const idx = plain.toLowerCase().indexOf(token.toLowerCase());
    if (idx >= 0) {
      bestPos = idx;
      break;
    }
  }

  // Center snippet around match position
  const start = Math.max(0, bestPos - Math.floor(maxLen / 3));
  const end = Math.min(plain.length, start + maxLen);
  let snippet = plain.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < plain.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Search published wiki articles using FTS5 with BM25 ranking.
 *
 * @param query - User search query
 * @param limit - Max results (default 5)
 * @param offset - Pagination offset (default 0)
 */
export async function searchWikiArticles(
  query: string,
  limit = 5,
  offset = 0,
): Promise<{ results: WikiSearchResult[]; total: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], total: 0 };

  // Check cache
  const cacheKey = `wiki:${trimmed}:${limit}:${offset}`;
  const cached = getCached<{ results: WikiSearchResult[]; total: number }>(cacheKey);
  if (cached) return cached;

  // Ensure FTS5 table exists
  await ensureFTS5();

  const matchExpr = buildSafeMatchExpr(trimmed);
  if (!matchExpr) return { results: [], total: 0 };

  try {
    // BM25 with column weights: title(10), summary(5), content(1)
    // FTS5 bm25() returns negative values (more negative = more relevant)
    const ftsRows = await prisma.$queryRawUnsafe<
      { article_id: string; rank_score: number }[]
    >(
      `SELECT article_id, bm25(article_fts, 10.0, 5.0, 1.0) as rank_score
       FROM article_fts
       WHERE article_fts MATCH ?
       ORDER BY rank_score
       LIMIT ? OFFSET ?`,
      matchExpr,
      limit,
      offset,
    );

    if (ftsRows.length === 0) {
      const result = { results: [], total: 0 };
      setCached(cacheKey, result);
      return result;
    }

    const ids = ftsRows.map((r) => r.article_id);

    // Fetch full article data for matched IDs
    const articles = await prisma.article.findMany({
      where: { id: { in: ids }, status: "published" },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        content: true,
      },
    });

    // Create a score map and preserve BM25 ranking order
    const scoreMap = new Map(ftsRows.map((r) => [r.article_id, r.rank_score]));
    const articleMap = new Map(articles.map((a) => [a.id, a]));

    const results: WikiSearchResult[] = ids
      .map((id) => {
        const a = articleMap.get(id);
        if (!a) return null;
        return {
          id: a.id,
          title: a.title,
          slug: a.slug,
          summary: a.summary,
          snippet: extractSnippet(a.content, trimmed),
          score: scoreMap.get(id) ?? 0,
        };
      })
      .filter((r): r is WikiSearchResult => r !== null);

    // Get total count for pagination
    const countRows = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT count(*) as cnt FROM article_fts WHERE article_fts MATCH ?`,
      matchExpr,
    );
    const total = Number(countRows[0]?.cnt ?? results.length);

    const result = { results, total };
    setCached(cacheKey, result);
    return result;
  } catch (err) {
    console.error("[WikiSearch] FTS5 query failed:", err);
    // Fallback: return empty rather than crash
    return { results: [], total: 0 };
  }
}
