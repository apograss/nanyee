import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = 10;

    const [items, total] = await Promise.all([
      prisma.article.findMany({
        where: { authorId: ctx.userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          viewCount: true,
          createdAt: true,
          publishedAt: true,
        },
      }),
      prisma.article.count({ where: { authorId: ctx.userId } }),
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
