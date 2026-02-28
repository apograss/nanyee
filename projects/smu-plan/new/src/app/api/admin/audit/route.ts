import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/audit — list pending articles
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const articles = await prisma.article.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { username: true, nickname: true } } },
    });

    return Response.json({
      ok: true,
      data: {
        articles: articles.map((a) => ({
          id: a.id,
          title: a.title,
          authorName: a.author.nickname || a.author.username,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
