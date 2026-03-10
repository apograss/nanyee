import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, handleAuthError } from "@/lib/auth/guard";
import { searchWikiArticles } from "@/lib/wiki/search";
import { sanitizeContent } from "@/lib/wiki/content";
import { checkEditRateLimit } from "@/lib/wiki/edit-rate-limit";
import { clearWikiSearchCache } from "@/lib/wiki/search-cache";
import { presentPublicUser } from "@/lib/user-presenter";
import { z } from "zod";
import slugify from "slugify";

// GET /api/wiki — list published articles
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("q");

  const where: Record<string, unknown> = { status: "published" };
  if (category) where.category = category;

  let articles;
  let total;

  if (search) {
    // Use shared FTS5 search service
    const { results: ftsResults, total: ftsTotal } = await searchWikiArticles(search, limit, (page - 1) * limit);
    const ids = ftsResults.map((r) => r.id);

    articles = ids.length > 0
      ? await prisma.article.findMany({
          where: { id: { in: ids }, status: "published" },
          include: { author: { select: { id: true, username: true, nickname: true, status: true } } },
        })
      : [];
    // Preserve FTS ranking order
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    articles.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    total = ftsTotal;
  } else {
    [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: [
          { isPinned: "desc" },
          { pinnedAt: "desc" },
          { publishedAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { id: true, username: true, nickname: true, status: true } } },
      }),
      prisma.article.count({ where }),
    ]);
  }

  return Response.json({
    ok: true,
    data: {
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        summary: a.summary,
        category: a.category,
        tags: a.tags ? JSON.parse(a.tags) : [],
        viewCount: a.viewCount,
        isPinned: a.isPinned,
        authorName: presentPublicUser(a.author).displayName,
        publishedAt: a.publishedAt?.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
      pagination: { page, limit, total },
    },
  });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  format: z.enum(["html", "markdown"]).default("html"),
  summary: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

// POST /api/wiki — create and publish article (wiki-style)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);

    const { allowed, retryAfterMs } = checkEditRateLimit(auth.userId);
    if (!allowed) {
      return Response.json(
        { ok: false, error: { code: 429, message: "编辑过于频繁，请稍后再试" } },
        { status: 429, headers: { "Retry-After": String(Math.ceil((retryAfterMs || 60000) / 1000)) } }
      );
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    const slug = slugify(data.title, { lower: true, strict: true }) +
      "-" + Date.now().toString(36);

    const content = data.format === "html" ? sanitizeContent(data.content) : data.content;

    const article = await prisma.article.create({
      data: {
        title: data.title,
        slug,
        content,
        format: data.format,
        summary: data.summary,
        category: data.category,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        authorId: auth.userId,
        lastEditorId: auth.userId,
        status: "published",
        publishedAt: new Date(),
      },
    });

    clearWikiSearchCache();

    return Response.json(
      { ok: true, data: { id: article.id, slug: article.slug } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
