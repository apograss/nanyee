import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { generateToken } from "@/lib/tokens/verify";
import { z } from "zod";

// GET /api/admin/tokens — list API tokens with this month's usage
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const tokens = await prisma.apiToken.findMany({
      orderBy: { createdAt: "desc" },
    });

    const tokensWithUsage = await Promise.all(
      tokens.map(async (t) => {
        const usageThisMonth = await prisma.tokenUsage.count({
          where: {
            apiTokenId: t.id,
            createdAt: { gte: monthStart },
          },
        });

        return {
          id: t.id,
          name: t.name,
          tokenPrefix: t.tokenPrefix,
          status: t.status,
          issuedTo: t.issuedTo,
          allowedModels: t.allowedModels ? JSON.parse(t.allowedModels) : null,
          lastUsedAt: t.lastUsedAt?.toISOString() || null,
          usageThisMonth,
        };
      })
    );

    return Response.json({ ok: true, data: { tokens: tokensWithUsage } });
  } catch (err) {
    return handleAuthError(err);
  }
}

const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  issuedTo: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  allowedModels: z.array(z.string()).optional(),
  rateLimitRpm: z.number().optional(),
  rateLimitRpd: z.number().optional(),
  monthlyTokenQuota: z.number().optional(),
  expiresInDays: z.number().optional(),
});

// POST /api/admin/tokens — create a new API token
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = createTokenSchema.parse(body);

    const { token, prefix, hash } = generateToken();

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400000)
      : null;

    await prisma.apiToken.create({
      data: {
        name: data.name,
        tokenPrefix: prefix,
        tokenHash: hash,
        issuedTo: data.issuedTo,
        description: data.description,
        allowedModels: data.allowedModels ? JSON.stringify(data.allowedModels) : null,
        rateLimitRpm: data.rateLimitRpm,
        rateLimitRpd: data.rateLimitRpd,
        monthlyTokenQuota: data.monthlyTokenQuota,
        expiresAt,
        ownerId: auth.userId,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "token.create",
        targetType: "apiToken",
        payload: JSON.stringify({ name: data.name, issuedTo: data.issuedTo }),
      },
    });

    return Response.json(
      { ok: true, data: { token, prefix } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
