import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

const updateLinkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  url: z.string().url().max(2000).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().optional(),
});

// PATCH /api/admin/links/[id] — update a link
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const existing = await prisma.link.findUnique({ where: { id } });
    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Link not found" } },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = updateLinkSchema.parse(body);

    const updated = await prisma.link.update({
      where: { id },
      data,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "link.update",
        targetType: "link",
        targetId: id,
        payload: JSON.stringify(data),
      },
    });

    return Response.json({
      ok: true,
      data: {
        id: updated.id,
        title: updated.title,
        url: updated.url,
        category: updated.category,
        description: updated.description,
        order: updated.order,
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

// DELETE /api/admin/links/[id] — delete a link
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const existing = await prisma.link.findUnique({ where: { id } });
    if (!existing) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Link not found" } },
        { status: 404 }
      );
    }

    await prisma.link.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "link.delete",
        targetType: "link",
        targetId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
