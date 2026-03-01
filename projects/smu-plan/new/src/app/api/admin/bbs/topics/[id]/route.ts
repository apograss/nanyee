import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

const patchSchema = z.object({
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    const [topic] = await prisma.$transaction([
      prisma.bbsTopic.update({ where: { id }, data }),
      prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: "bbs.topic.update",
          targetType: "BbsTopic",
          targetId: id,
          payload: JSON.stringify(data),
        },
      }),
    ]);

    return Response.json({ ok: true, data: topic });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdmin(req);
    const { id } = await params;

    await prisma.$transaction([
      prisma.bbsTopic.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: "bbs.topic.delete",
          targetType: "BbsTopic",
          targetId: id,
        },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
