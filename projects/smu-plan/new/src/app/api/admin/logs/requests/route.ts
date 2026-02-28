import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/logs/requests — request log viewer
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const skip = (page - 1) * limit;

    const tokenId = url.searchParams.get("tokenId") || undefined;
    const model = url.searchParams.get("model") || undefined;
    const success = url.searchParams.get("success");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    // Build where clause
    const where: Record<string, unknown> = {};
    if (tokenId) where.apiTokenId = tokenId;
    if (model) where.model = model;
    if (success !== null && success !== undefined && success !== "") {
      where.success = success === "true";
    }
    if (start || end) {
      where.createdAt = {};
      if (start) (where.createdAt as Record<string, unknown>).gte = new Date(start);
      if (end) (where.createdAt as Record<string, unknown>).lte = new Date(end);
    }

    const [items, total] = await Promise.all([
      prisma.tokenUsage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          apiTokenId: true,
          channelId: true,
          endpoint: true,
          toolName: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          success: true,
          errorCode: true,
          responseMs: true,
          clientIp: true,
          requestId: true,
          createdAt: true,
        },
      }),
      prisma.tokenUsage.count({ where }),
    ]);

    // Batch fetch token names
    const tokenIds = [...new Set(items.map((i) => i.apiTokenId).filter(Boolean))];
    const tokens = tokenIds.length > 0
      ? await prisma.apiToken.findMany({
          where: { id: { in: tokenIds } },
          select: { id: true, name: true, tokenPrefix: true },
        })
      : [];
    const tokenMap = new Map(tokens.map((t) => [t.id, t]));

    const data = items.map((item) => {
      const token = tokenMap.get(item.apiTokenId);
      return {
        ...item,
        tokenName: token?.name || item.apiTokenId,
        tokenPrefix: token?.tokenPrefix || null,
      };
    });

    return Response.json({
      ok: true,
      data: {
        items: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error("Request logs error:", err);
    return handleAuthError(err);
  }
}
