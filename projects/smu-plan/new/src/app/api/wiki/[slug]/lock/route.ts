import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

const lockSchema = z.object({
  locked: z.boolean(),
});

// PATCH /api/wiki/[slug]/lock — admin-only lock/unlock
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { slug } = await params;
    const body = await req.json();
    const { locked } = lockSchema.parse(body);

    // Find article by slug or id
    let article = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
    if (!article) {
      article = await prisma.article.findUnique({ where: { id: slug }, select: { id: true } });
    }

    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Article not found" } },
        { status: 404 }
      );
    }

    await prisma.article.update({
      where: { id: article.id },
      data: {
        isLocked: locked,
        lockedAt: locked ? new Date() : null,
        lockedBy: locked ? auth.userId : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: locked ? "article.lock" : "article.unlock",
        targetType: "Article",
        targetId: article.id,
      },
    });

    return Response.json({ ok: true, data: { locked } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid input" } },
        { status: 400 }
      );
    }
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
