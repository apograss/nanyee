import { NextRequest } from "next/server";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const pinSchema = z.object({
  isPinned: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const { isPinned } = pinSchema.parse(body);

    const [article] = await prisma.$transaction([
      prisma.article.update({
        where: { id },
        data: {
          isPinned,
          pinnedAt: isPinned ? new Date() : null,
        },
        select: { id: true, isPinned: true, pinnedAt: true, slug: true },
      }),
      prisma.auditLog.create({
        data: {
          actorId: admin.userId,
          action: "article.pin",
          targetType: "Article",
          targetId: id,
          payload: JSON.stringify({ isPinned }),
        },
      }),
    ]);

    return Response.json({ ok: true, data: article });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "参数错误" } },
        { status: 400 }
      );
    }
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "文章不存在" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
