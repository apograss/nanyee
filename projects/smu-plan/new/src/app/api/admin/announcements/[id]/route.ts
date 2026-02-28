import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

const updateAnnouncementSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().optional(),
});

// PATCH /api/admin/announcements/[id] — update an announcement
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Announcement not found" } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = updateAnnouncementSchema.parse(body);

    const updated = await prisma.announcement.update({
      where: { id },
      data,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "announcement.update",
        targetType: "announcement",
        targetId: id,
        payload: JSON.stringify(data),
      },
    });

    return Response.json({
      ok: true,
      data: {
        id: updated.id,
        content: updated.content,
        active: updated.active,
        priority: updated.priority,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
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

// DELETE /api/admin/announcements/[id] — delete an announcement
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Announcement not found" } },
        { status: 404 }
      );
    }

    await prisma.announcement.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "announcement.delete",
        targetType: "announcement",
        targetId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
