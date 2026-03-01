import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = 20;

    const [items, total] = await Promise.all([
      prisma.message.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { username: true, nickname: true } } },
      }),
      prisma.message.count(),
    ]);

    return Response.json({
      ok: true,
      data: {
        items: items.map((m) => ({
          ...m,
          authorName: m.author.nickname || m.author.username,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
