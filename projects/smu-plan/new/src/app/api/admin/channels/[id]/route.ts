import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  rateLimitRpm: z.number().int().positive().optional().nullable(),
  rateLimitRpd: z.number().int().positive().optional().nullable(),
  modelMapping: z.record(z.string()).optional().nullable(),
});

// PATCH /api/admin/channels/[id] — update channel
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = updateChannelSchema.parse(body);

    const channel = await prisma.apiChannel.findUnique({ where: { id } });
    if (!channel) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Channel not found" } },
        { status: 404 }
      );
    }

    // Check name uniqueness if changed
    if (data.name && data.name !== channel.name) {
      const existing = await prisma.apiChannel.findUnique({ where: { name: data.name } });
      if (existing) {
        return Response.json(
          { ok: false, error: { code: 409, message: "Channel name already exists" } },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const ch = await tx.apiChannel.update({
        where: { id },
        data: {
          ...data,
          modelMapping: data.modelMapping !== undefined
            ? (data.modelMapping ? JSON.stringify(data.modelMapping) : null)
            : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          action: "channel.update",
          targetType: "channel",
          targetId: id,
          payload: JSON.stringify(data),
        },
      });
      return ch;
    });

    return Response.json({ ok: true, data: { channel: updated } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return Response.json(
        { ok: false, error: { code: 409, message: "Channel name already exists" } },
        { status: 409 }
      );
    }
    if (code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Channel not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}

// DELETE /api/admin/channels/[id] — delete channel
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(req);

    const channel = await prisma.apiChannel.findUnique({ where: { id } });
    if (!channel) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Channel not found" } },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.apiChannel.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          action: "channel.delete",
          targetType: "channel",
          targetId: id,
          payload: JSON.stringify({ name: channel.name }),
        },
      });
    });

    return Response.json({ ok: true, data: { message: "Deleted" } });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Channel not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
