import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id, action } = await params;

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    if (action === "publish") {
      await prisma.article.update({
        where: { id },
        data: {
          status: "published",
          publishedAt: new Date(),
          reviewerId: auth.userId,
        },
      });
    } else if (action === "reject") {
      await prisma.article.update({
        where: { id },
        data: {
          status: "rejected",
          reviewerId: auth.userId,
        },
      });
    } else {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid action" } },
        { status: 400 }
      );
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: `article.${action}`,
        targetType: "article",
        targetId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
