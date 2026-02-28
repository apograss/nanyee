import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/guard";

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  rateLimitRpm: z.number().int().positive().optional().nullable(),
  rateLimitRpd: z.number().int().positive().optional().nullable(),
  modelMapping: z.record(z.string()).optional().nullable(),
});

// GET /api/admin/channels — list channels
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const channels = await prisma.apiChannel.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        rateLimitRpm: true,
        rateLimitRpd: true,
        modelMapping: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { keyUsages: true, tokenUsages: true } },
      },
    });

    const data = channels.map((ch) => {
      let mapping = null;
      if (ch.modelMapping) {
        try { mapping = JSON.parse(ch.modelMapping); } catch {}
      }
      return {
        ...ch,
        modelMapping: mapping,
        usageCount: ch._count.keyUsages + ch._count.tokenUsages,
        _count: undefined,
      };
    });

    return Response.json({ ok: true, data: { items: data } });
  } catch (err) {
    return handleAuthError(err);
  }
}

// POST /api/admin/channels — create channel
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = createChannelSchema.parse(body);

    // Check uniqueness
    const existing = await prisma.apiChannel.findUnique({ where: { name: data.name } });
    if (existing) {
      return Response.json(
        { ok: false, error: { code: 409, message: "Channel name already exists" } },
        { status: 409 }
      );
    }

    const channel = await prisma.$transaction(async (tx) => {
      const ch = await tx.apiChannel.create({
        data: {
          name: data.name,
          description: data.description,
          enabled: data.enabled,
          rateLimitRpm: data.rateLimitRpm,
          rateLimitRpd: data.rateLimitRpd,
          modelMapping: data.modelMapping ? JSON.stringify(data.modelMapping) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          action: "channel.create",
          targetType: "channel",
          targetId: ch.id,
          payload: JSON.stringify({ name: data.name }),
        },
      });
      return ch;
    });

    return Response.json({ ok: true, data: { channel } }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    if ((err as { code?: string }).code === "P2002") {
      return Response.json(
        { ok: false, error: { code: 409, message: "Channel name already exists" } },
        { status: 409 }
      );
    }
    return handleAuthError(err);
  }
}
