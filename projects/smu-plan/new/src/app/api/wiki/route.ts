import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, handleAuthError } from "@/lib/auth/guard";
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
    // Use FTS5
    const ftsResults = await prisma.$queryRawUnsafe<{ article_id: string }[]>(
      `SELECT article_id FROM article_fts WHERE article_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?`,
      search,
      limit,
      (page - 1) * limit
    );
    const ids = ftsResults.map((r) => r.article_id);

    articles = ids.length > 0
      ? await prisma.article.findMany({
          where: { id: { in: ids }, status: "published" },
          include: { author: { select: { username: true, nickname: true } } },
        })
      : [];
    total = articles.length;
  } else {
    [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { username: true, nickname: true } } },
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
        authorName: a.author.nickname || a.author.username,
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
  summary: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

// POST /api/wiki — create draft article
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const body = await req.json();
    const data = createSchema.parse(body);

    const slug = slugify(data.title, { lower: true, strict: true }) +
      "-" + Date.now().toString(36);

    const article = await prisma.article.create({
      data: {
        title: data.title,
        slug,
        content: data.content,
        summary: data.summary,
        category: data.category,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        authorId: auth.userId,
        status: "draft",
      },
    });

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
