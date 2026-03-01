import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdmin(req);
    const { id } = await params;

    await prisma.$transaction([
      prisma.bbsReply.delete({ where: { id } }),
      prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: "bbs.reply.delete",
          targetType: "BbsReply",
          targetId: id,
        },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Reply not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
