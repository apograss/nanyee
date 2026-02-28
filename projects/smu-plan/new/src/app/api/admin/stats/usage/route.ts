import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/stats/usage — aggregated usage statistics
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const granularity = url.searchParams.get("granularity") || "day"; // day | week | month
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
    const channelId = url.searchParams.get("channelId") || undefined;
    const tokenId = url.searchParams.get("tokenId") || undefined;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString();

    // SQLite strftime format for grouping (safe — no user input)
    let dateFmt: string;
    switch (granularity) {
      case "week":
        dateFmt = "%Y-W%W";
        break;
      case "month":
        dateFmt = "%Y-%m";
        break;
      default:
        dateFmt = "%Y-%m-%d";
    }

    // Build parameterized WHERE clauses
    const conditions: Prisma.Sql[] = [Prisma.sql`tu.createdAt >= ${startISO}`];
    if (channelId) conditions.push(Prisma.sql`tu.channelId = ${channelId}`);
    if (tokenId) conditions.push(Prisma.sql`tu.apiTokenId = ${tokenId}`);
    const whereClause = Prisma.join(conditions, " AND ");

    // Query TokenUsage aggregation (primary usage data)
    const usageData = await prisma.$queryRaw<
      Array<{
        date: string;
        totalRequests: number;
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalCost: number | null;
        successCount: number;
      }>
    >(
      Prisma.sql`SELECT
        strftime(${dateFmt}, tu.createdAt) as date,
        COUNT(*) as totalRequests,
        COALESCE(SUM(tu.promptTokens), 0) as totalPromptTokens,
        COALESCE(SUM(tu.completionTokens), 0) as totalCompletionTokens,
        SUM(tu.costUsd) as totalCost,
        SUM(CASE WHEN tu.success = 1 THEN 1 ELSE 0 END) as successCount
      FROM TokenUsage tu
      WHERE ${whereClause}
      GROUP BY date
      ORDER BY date ASC`
    );

    const series = usageData.map((row) => ({
      date: row.date,
      totalRequests: Number(row.totalRequests),
      totalTokens: Number(row.totalPromptTokens) + Number(row.totalCompletionTokens),
      promptTokens: Number(row.totalPromptTokens),
      completionTokens: Number(row.totalCompletionTokens),
      totalCost: row.totalCost ? Number(row.totalCost) : 0,
      successRate:
        Number(row.totalRequests) > 0
          ? Math.round((Number(row.successCount) / Number(row.totalRequests)) * 100)
          : 100,
    }));

    // Summary stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayStats, monthStats] = await Promise.all([
      prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: todayStart } },
        _count: true,
        _sum: { promptTokens: true, completionTokens: true, costUsd: true },
      }),
      prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: monthStart } },
        _count: true,
        _sum: { promptTokens: true, completionTokens: true, costUsd: true },
      }),
    ]);

    return Response.json({
      ok: true,
      data: {
        series,
        summary: {
          today: {
            requests: todayStats._count,
            tokens: (todayStats._sum.promptTokens || 0) + (todayStats._sum.completionTokens || 0),
            cost: todayStats._sum.costUsd || 0,
          },
          month: {
            requests: monthStats._count,
            tokens: (monthStats._sum.promptTokens || 0) + (monthStats._sum.completionTokens || 0),
            cost: monthStats._sum.costUsd || 0,
          },
        },
      },
    });
  } catch (err) {
    console.error("Usage stats error:", err);
    return handleAuthError(err);
  }
}
