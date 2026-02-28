import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/bbs/topics/[id]/replies — list replies
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const topic = await prisma.bbsTopic.findUnique({ where: { id }, select: { id: true } });
    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    const where = { topicId: id };

    const [items, total] = await Promise.all([
      prisma.bbsReply.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: limit,
        select: {
          id: true,
          content: true,
          authorId: true,
          createdAt: true,
        },
      }),
      prisma.bbsReply.count({ where }),
    ]);

    // Batch fetch authors
    const authorIds = [...new Set(items.map((r) => r.authorId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, nickname: true },
    });
    const authorMap = new Map(authors.map((a) => [a.id, a]));

    const data = items.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      author: authorMap.get(r.authorId) || { id: r.authorId, username: "unknown", nickname: null },
    }));

    return Response.json({
      ok: true,
      data: {
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error("BBS replies list error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}

const createReplySchema = z.object({
  content: z.string().min(1).max(5000),
});

// POST /api/bbs/topics/[id]/replies — create reply
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);
    const body = await req.json();
    const data = createReplySchema.parse(body);

    const topic = await prisma.bbsTopic.findUnique({
      where: { id },
      select: { id: true, locked: true },
    });

    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    if (topic.locked) {
      return Response.json(
        { ok: false, error: { code: 403, message: "Topic is locked" } },
        { status: 403 }
      );
    }

    // Create reply and update topic stats in transaction
    const now = new Date();
    const [reply] = await prisma.$transaction([
      prisma.bbsReply.create({
        data: {
          content: data.content,
          authorId: auth.userId,
          topicId: id,
        },
      }),
      prisma.bbsTopic.update({
        where: { id },
        data: {
          replyCount: { increment: 1 },
          lastReplyAt: now,
        },
      }),
    ]);

    return Response.json(
      { ok: true, data: { reply } },
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
