import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, handleAuthError } from "@/lib/auth/guard";
import { resolveArticle } from "@/lib/wiki/comments";
import { presentPublicUser } from "@/lib/user-presenter";
import { z } from "zod";

// GET /api/wiki/[slug]/comments — list comments grouped by paragraph
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const article = await resolveArticle(slug);
  if (!article || article.status !== "published") {
    return Response.json(
      { ok: false, error: { code: 404, message: "文章不存在或暂未发布" } },
      { status: 404 }
    );
  }

  const comments = await prisma.comment.findMany({
    where: { articleId: article.id },
    orderBy: [{ paragraphIndex: "asc" }, { createdAt: "asc" }],
    include: {
      author: {
        select: { id: true, username: true, nickname: true, avatarUrl: true, status: true },
      },
    },
  });

  // Group by paragraphIndex
  const groupMap = new Map<number, { paragraphIndex: number; count: number; items: unknown[] }>();
  for (const c of comments) {
    let group = groupMap.get(c.paragraphIndex);
    if (!group) {
      group = { paragraphIndex: c.paragraphIndex, count: 0, items: [] };
      groupMap.set(c.paragraphIndex, group);
    }
    group.count++;
    group.items.push({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: presentPublicUser(c.author),
    });
  }

  return Response.json({
    ok: true,
    data: { groups: Array.from(groupMap.values()) },
  });
}

const createCommentSchema = z.object({
  paragraphIndex: z.number().int().min(0),
  content: z.string().trim().min(1).max(1000),
});

// POST /api/wiki/[slug]/comments — create comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireUser(req);
    const { slug } = await params;
    const article = await resolveArticle(slug);
    if (!article || article.status !== "published") {
      return Response.json(
        { ok: false, error: { code: 404, message: "文章不存在或暂未发布" } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = createCommentSchema.parse(body);

    const comment = await prisma.comment.create({
      data: {
        articleId: article.id,
        paragraphIndex: data.paragraphIndex,
        content: data.content,
        authorId: auth.userId,
      },
      include: {
        author: {
          select: { id: true, username: true, nickname: true, avatarUrl: true, status: true },
        },
      },
    });

    return Response.json(
      {
        ok: true,
        data: {
          id: comment.id,
          content: comment.content,
          paragraphIndex: comment.paragraphIndex,
          createdAt: comment.createdAt.toISOString(),
          author: presentPublicUser(comment.author),
        },
      },
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
