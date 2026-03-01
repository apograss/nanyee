import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["draft", "pending", "published", "rejected", "hidden"]).optional(),
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

    const updateData: Record<string, unknown> = {};
    if (data.title) updateData.title = data.title;
    if (data.content) updateData.content = data.content;
    if (data.tags) updateData.tags = JSON.stringify(data.tags);
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "published") updateData.publishedAt = new Date();
    }

    const [article] = await prisma.$transaction([
      prisma.article.update({ where: { id }, data: updateData }),
      prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: "article.update",
          targetType: "Article",
          targetId: id,
          payload: JSON.stringify(data),
        },
      }),
    ]);

    return Response.json({ ok: true, data: article });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid input" } },
        { status: 400 }
      );
    }
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Article not found" } },
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
      prisma.article.update({ where: { id }, data: { status: "hidden" } }),
      prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: "article.hide",
          targetType: "Article",
          targetId: id,
        },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return Response.json(
        { ok: false, error: { code: 404, message: "Article not found" } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
