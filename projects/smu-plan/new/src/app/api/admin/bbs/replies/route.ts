import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = 20;
    const topicId = url.searchParams.get("topicId") || "";

    const where: Record<string, unknown> = {};
    if (topicId) where.topicId = topicId;

    const [items, total] = await Promise.all([
      prisma.bbsReply.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { topic: { select: { title: true } } },
      }),
      prisma.bbsReply.count({ where }),
    ]);

    return Response.json({
      ok: true,
      data: {
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
