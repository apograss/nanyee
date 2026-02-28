import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/logs/audit — audit log viewer
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const skip = (page - 1) * limit;

    const action = url.searchParams.get("action") || undefined;
    const actorId = url.searchParams.get("actorId") || undefined;
    const targetType = url.searchParams.get("targetType") || undefined;
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (targetType) where.targetType = targetType;
    if (start || end) {
      where.createdAt = {};
      if (start) (where.createdAt as Record<string, unknown>).gte = new Date(start);
      if (end) (where.createdAt as Record<string, unknown>).lte = new Date(end);
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Batch fetch actor names
    const actorIds = [...new Set(items.map((i) => i.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, username: true, nickname: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const data = items.map((item) => {
      const actor = item.actorId ? actorMap.get(item.actorId) : null;
      return {
        ...item,
        payload: (() => { try { return item.payload ? JSON.parse(item.payload) : null; } catch { return null; } })(),
        actorName: actor?.nickname || actor?.username || item.actorId || "System",
      };
    });

    // Get distinct actions for filter dropdown
    const distinctActions = await prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });

    return Response.json({
      ok: true,
      data: {
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        filters: {
          actions: distinctActions.map((a) => a.action),
        },
      },
    });
  } catch (err) {
    console.error("Audit logs error:", err);
    return handleAuthError(err);
  }
}
