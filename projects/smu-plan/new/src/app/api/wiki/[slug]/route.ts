import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { clearWikiSearchCache } from "@/lib/wiki/search-cache";
import { sanitizeContent } from "@/lib/wiki/content";
import { canEditArticle } from "@/lib/wiki/permissions";
import { checkEditRateLimit } from "@/lib/wiki/edit-rate-limit";
import { createRevision } from "@/lib/wiki/revisions";
import { presentPublicUser } from "@/lib/user-presenter";
import { resolveWikiCategorySelection } from "@/lib/wiki/categories";
import { ARTICLE_FORMATS, canUseInteractiveHtml } from "@/lib/wiki/formats";
import { z } from "zod";

// GET /api/wiki/[slug] — article detail (lookup by slug or id)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await getAuthContext(req);

  // Look up by slug or id in a single query
  const articleInclude = {
    author: { select: { id: true, username: true, nickname: true, status: true } },
    lastEditor: { select: { id: true, username: true, nickname: true, status: true } },
    categoryRef: {
      include: {
        parent: { select: { id: true, name: true, slug: true, icon: true } },
      },
    },
  } as const;

  const article = await prisma.article.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: articleInclude,
  });

  if (!article || (article.status !== "published" && auth?.role !== "admin")) {
    return Response.json(
      { ok: false, error: { code: 404, message: "Article not found" } },
      { status: 404 }
    );
  }

  // Increment view count (fire-and-forget)
  prisma.article
    .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  return Response.json({
    ok: true,
    data: {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      format: article.format,
      summary: article.summary,
      categoryId: article.categoryId,
      category: article.category,
      categoryMeta: article.categoryRef
        ? {
            id: article.categoryRef.id,
            name: article.categoryRef.name,
            slug: article.categoryRef.slug,
            icon: article.categoryRef.icon,
            parentName: article.categoryRef.parent?.name ?? null,
            parentSlug: article.categoryRef.parent?.slug ?? null,
            parentIcon: article.categoryRef.parent?.icon ?? null,
          }
        : null,
      tags: article.tags ? JSON.parse(article.tags) : [],
      viewCount: article.viewCount,
      authorId: article.author.id,
      authorName: presentPublicUser(article.author).displayName,
      lastEditorName: article.lastEditor ? presentPublicUser(article.lastEditor).displayName : null,
      isLocked: article.isLocked,
      lockedBy: article.lockedBy,
      publishedAt: article.publishedAt?.toISOString(),
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    },
  });
}

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  format: z.enum(ARTICLE_FORMATS).optional(),
  summary: z.string().max(500).optional(),
  categoryId: z.string().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).max(10).optional(),
  editSummary: z.string().max(200).optional(),
});

// PUT /api/wiki/[slug] — collaborative edit (param is article id)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: id } = await params;
    const auth = await requireUser(req);

    const { allowed, retryAfterMs } = checkEditRateLimit(auth.userId);
    if (!allowed) {
      return Response.json(
        { ok: false, error: { code: 429, message: "编辑过于频繁，请稍后再试" } },
        { status: 429, headers: { "Retry-After": String(Math.ceil((retryAfterMs || 60000) / 1000)) } }
      );
    }

    const body = await req.json();
    const data = updateSchema.parse(body);

    if (data.format === "interactive-html" && !canUseInteractiveHtml(auth.role)) {
      return Response.json(
        { ok: false, error: { code: 403, message: "只有管理员可以保存互动 HTML" } },
        { status: 403 },
      );
    }

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

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    if (!canEditArticle(article, auth)) {
      return Response.json(
        { ok: false, error: { code: 403, message: "文章已锁定，无法编辑" } },
        { status: 403 }
      );
    }

    // Create a revision snapshot of the current state before applying changes
    await createRevision({
      articleId: article.id,
      title: article.title,
      content: article.content,
      format: article.format,
      summary: article.summary,
      editorId: auth.userId,
      editSummary: data.editSummary,
    });

    // Sanitize HTML content
    const format = data.format || article.format;
    const content = data.content
      ? (format === "html" ? sanitizeContent(data.content) : data.content)
      : undefined;

    const updated = await prisma.article.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(content && { content }),
        ...(data.format && { format: data.format }),
        ...(data.summary !== undefined && { summary: data.summary }),
        ...(data.category !== undefined || data.categoryId !== undefined
          ? {
              category: resolvedCategory?.name ?? data.category?.trim() ?? null,
              categoryId: resolvedCategory?.id ?? null,
            }
          : {}),
        ...(data.tags && { tags: JSON.stringify(data.tags) }),
        lastEditorId: auth.userId,
      },
    });

    clearWikiSearchCache();

    return Response.json({
      ok: true,
      data: { id: updated.id, slug: updated.slug },
    });
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

// DELETE /api/wiki/[slug] — admin-only hide article
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: id } = await params;
    const auth = await requireAdmin(req);

    await prisma.article.update({
      where: { id },
      data: { status: "hidden" },
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "article.hide",
        targetType: "Article",
        targetId: id,
      },
    });

    clearWikiSearchCache();

    return Response.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
