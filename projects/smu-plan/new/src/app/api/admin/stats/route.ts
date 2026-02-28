import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [
      totalUsers,
      totalArticles,
      totalSearches,
      totalToolRuns,
      activeKeys,
      activeTokens,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.article.count({ where: { status: "published" } }),
      prisma.searchLog.count(),
      prisma.toolRun.count(),
      prisma.providerKey.count({ where: { status: "active" } }),
      prisma.apiToken.count({ where: { status: "active" } }),
    ]);

    return Response.json({
      ok: true,
      data: {
        totalUsers,
        totalArticles,
        totalSearches,
        totalToolRuns,
        activeKeys,
        activeTokens,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
