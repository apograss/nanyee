import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/wiki/[slug] — article detail (lookup by slug)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Try slug first, then fall back to id
  let article = await prisma.article.findUnique({
    where: { slug },
    include: { author: { select: { username: true, nickname: true } } },
  });

  if (!article) {
    article = await prisma.article.findUnique({
      where: { id: slug },
      include: { author: { select: { username: true, nickname: true } } },
    });
  }

  if (!article || article.status !== "published") {
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
      summary: article.summary,
      category: article.category,
      tags: article.tags ? JSON.parse(article.tags) : [],
      viewCount: article.viewCount,
      authorName: article.author.nickname || article.author.username,
      publishedAt: article.publishedAt?.toISOString(),
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    },
  });
}

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

// PUT /api/wiki/[slug] — update article (param is article id)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: id } = await params;
    const auth = await requireUser(req);
    const body = await req.json();
    const data = updateSchema.parse(body);

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    if (article.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    const updated = await prisma.article.update({
      where: { id },
      data: {
        ...data,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
    });

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

// POST /api/wiki/[slug] — submit article for review (param is article id)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: id } = await params;
    const auth = await requireUser(req);

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    if (article.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    await prisma.article.update({
      where: { id },
      data: { status: "pending" },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
