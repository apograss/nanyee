import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { sanitizeContent } from "@/lib/wiki/content";
import { checkEditRateLimit } from "@/lib/wiki/edit-rate-limit";
import { clearWikiSearchCache } from "@/lib/wiki/search-cache";
import { listArticles, type SortMode } from "@/lib/wiki/queries";
import { resolveWikiCategorySelection } from "@/lib/wiki/categories";
import { z } from "zod";
import slugify from "slugify";

// GET /api/wiki — list published articles
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || "1");
  const limit = Number(url.searchParams.get("limit") || "20");
  const sort = (url.searchParams.get("sort") || "newest") as SortMode;
  const category = url.searchParams.get("category") || undefined;
  const tag = url.searchParams.get("tag") || undefined;
  const q = url.searchParams.get("q") || undefined;

  const result = await listArticles({ page, limit, sort, category, tag, q });

  return Response.json({ ok: true, data: result });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  format: z.enum(["html", "markdown"]).default("html"),
  summary: z.string().max(500).optional(),
  categoryId: z.string().optional(),
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
    const resolvedCategory = await resolveWikiCategorySelection({
      categoryId: data.categoryId,
      category: data.category,
    });

    if (data.categoryId && !resolvedCategory) {
      return Response.json(
        { ok: false, error: { code: 400, message: "分类不存在" } },
        { status: 400 },
      );
    }

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
        category: resolvedCategory?.name ?? data.category?.trim() ?? null,
        categoryId: resolvedCategory?.id ?? null,
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
