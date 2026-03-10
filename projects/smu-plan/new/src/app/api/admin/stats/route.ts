import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [totalUsers, totalArticles, totalSearches, totalToolRuns] = await Promise.all([
      prisma.user.count(),
      prisma.article.count({ where: { status: "published" } }),
      prisma.searchLog.count(),
      prisma.toolRun.count(),
    ]);

    return Response.json({
      ok: true,
      data: {
        totalUsers,
        totalArticles,
        totalSearches,
        totalToolRuns,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
