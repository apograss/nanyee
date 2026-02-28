import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { encryptKey } from "@/lib/keys/selector";
import { z } from "zod";

// GET /api/admin/keys — list provider keys with today's usage
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const keys = await prisma.providerKey.findMany({
      orderBy: { createdAt: "desc" },
    });

    const keysWithUsage = await Promise.all(
      keys.map(async (key) => {
        const usageToday = await prisma.keyUsage.count({
          where: {
            providerKeyId: key.id,
            createdAt: { gte: todayStart },
          },
        });

        return {
          id: key.id,
          provider: key.provider,
          keyPrefix: key.keyPrefix,
          status: key.status,
          weight: key.weight,
          dailyLimit: key.dailyLimit,
          usageToday,
          lastCheckAt: key.lastCheckAt?.toISOString() || null,
        };
      })
    );

    return Response.json({ ok: true, data: { keys: keysWithUsage } });
  } catch (err) {
    return handleAuthError(err);
  }
}

const addKeySchema = z.object({
  provider: z.string().default("longcat"),
  apiKey: z.string().min(1),
  weight: z.number().min(1).default(1),
  dailyLimit: z.number().nullable().optional(),
  monthlyLimit: z.number().nullable().optional(),
});

// POST /api/admin/keys — add a provider key
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const data = addKeySchema.parse(body);

    const keyCipher = encryptKey(data.apiKey);
    const keyPrefix = data.apiKey.slice(0, 8);

    const key = await prisma.providerKey.create({
      data: {
        provider: data.provider,
        keyPrefix,
        keyCipher,
        weight: data.weight,
        dailyLimit: data.dailyLimit ?? null,
        monthlyLimit: data.monthlyLimit ?? null,
      },
    });

    return Response.json(
      { ok: true, data: { id: key.id, keyPrefix } },
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
