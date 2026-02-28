import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/bbs/topics — list topics
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const where = category && category !== "all" ? { category } : {};

    const [items, total] = await Promise.all([
      prisma.bbsTopic.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          authorId: true,
          pinned: true,
          locked: true,
          viewCount: true,
          replyCount: true,
          lastReplyAt: true,
          createdAt: true,
        },
      }),
      prisma.bbsTopic.count({ where }),
    ]);

    // Batch fetch authors
    const authorIds = [...new Set(items.map((t) => t.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, nickname: true },
    });
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    const data = items.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      pinned: t.pinned,
      locked: t.locked,
      viewCount: t.viewCount,
      replyCount: t.replyCount,
      lastReplyAt: t.lastReplyAt,
      createdAt: t.createdAt,
      author: authorMap.get(t.authorId) || { id: t.authorId, username: "unknown", nickname: null },
    }));

    return Response.json({
      ok: true,
      data: {
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error("BBS topics list error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}

const createTopicSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  category: z.enum(["general", "study", "life", "trade", "question"]).default("general"),
});

// POST /api/bbs/topics — create topic
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const body = await req.json();
    const data = createTopicSchema.parse(body);

    const topic = await prisma.bbsTopic.create({
      data: {
        title: data.title,
        content: data.content,
        category: data.category,
        authorId: auth.userId,
      },
    });

    return Response.json(
      {
        ok: true,
        data: { topic },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
