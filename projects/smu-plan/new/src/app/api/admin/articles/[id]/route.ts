import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { clearWikiSearchCache } from "@/lib/wiki/search-cache";
import { sanitizeContent } from "@/lib/wiki/content";
import { createRevision } from "@/lib/wiki/revisions";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["published", "hidden"]).optional(),
  isLocked: z.boolean().optional(),
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
    if (data.content) {
      // Fetch current article to create revision before update
      const current = await prisma.article.findUnique({ where: { id } });
      if (current) {
        await createRevision({
          articleId: id,
          title: current.title,
          content: current.content,
          format: current.format,
          summary: current.summary,
          editorId: ctx.userId,
          editSummary: "Admin edit",
        });
      }
      updateData.content = current?.format === "html" ? sanitizeContent(data.content) : data.content;
    }
    if (data.tags) updateData.tags = JSON.stringify(data.tags);
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "published") updateData.publishedAt = new Date();
    }
    if (data.isLocked !== undefined) {
      updateData.isLocked = data.isLocked;
      updateData.lockedAt = data.isLocked ? new Date() : null;
      updateData.lockedBy = data.isLocked ? ctx.userId : null;
    }
    updateData.lastEditorId = ctx.userId;

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

    clearWikiSearchCache();

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
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";

    if (permanent) {
      // Hard delete: permanently remove article + clean FTS5
      await prisma.$transaction([
        prisma.article.delete({ where: { id } }),
        prisma.auditLog.create({
          data: {
            actorId: ctx.userId,
            action: "article.delete",
            targetType: "Article",
            targetId: id,
          },
        }),
      ]);
      // Best-effort FTS5 cleanup (trigger handles it, but explicit as safety net)
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM article_fts WHERE article_id = ?`,
          id
        );
      } catch {
        // FTS5 table may not exist; ignore
      }
    } else {
      // Soft delete: mark as hidden
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
    }

    clearWikiSearchCache();

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
