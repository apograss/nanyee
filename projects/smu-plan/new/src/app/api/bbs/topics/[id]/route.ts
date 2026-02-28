import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, requireUser, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/bbs/topics/[id] — topic detail
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Find first, then increment — avoids Prisma error on non-existent id
    const topic = await prisma.bbsTopic.findUnique({ where: { id } });

    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    // Increment viewCount
    await prisma.bbsTopic.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    const author = await prisma.user.findUnique({
      where: { id: topic.authorId },
      select: { id: true, username: true, nickname: true },
    });

    return Response.json({
      ok: true,
      data: {
        topic: {
          ...topic,
          viewCount: topic.viewCount + 1,
          author: author || { id: topic.authorId, username: "unknown", nickname: null },
        },
      },
    });
  } catch (err) {
    console.error("BBS topic detail error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}

const updateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  category: z.enum(["general", "study", "life", "trade", "question"]).optional(),
});

// PATCH /api/bbs/topics/[id] — edit topic (author or admin)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);
    const body = await req.json();
    const data = updateTopicSchema.parse(body);

    const topic = await prisma.bbsTopic.findUnique({ where: { id } });
    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    if (topic.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    const updated = await prisma.bbsTopic.update({
      where: { id },
      data,
    });

    return Response.json({ ok: true, data: { topic: updated } });
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

// DELETE /api/bbs/topics/[id] — delete topic (author or admin)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);

    const topic = await prisma.bbsTopic.findUnique({ where: { id } });
    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    if (topic.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    await prisma.bbsTopic.delete({ where: { id } });

    return Response.json({ ok: true, data: { message: "Deleted" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
