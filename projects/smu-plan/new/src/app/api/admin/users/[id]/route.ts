import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.enum(["contributor", "editor", "admin"]).optional(),
  status: z.enum(["active", "banned"]).optional(),
});

// PATCH /api/admin/users/[id] — update user role or status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const body = await req.json();
    const data = updateUserSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return Response.json(
        { ok: false, error: { code: 404, message: "User not found" } },
        { status: 404 }
      );
    }

    // Prevent admin from demoting themselves
    if (id === auth.userId && data.role && data.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 400, message: "Cannot change your own role" } },
        { status: 400 }
      );
    }

    // Prevent admin from banning themselves
    if (id === auth.userId && data.status === "banned") {
      return Response.json(
        { ok: false, error: { code: 400, message: "Cannot ban yourself" } },
        { status: 400 }
      );
    }

    const updateData: Record<string, string> = {};
    if (data.role) updateData.role = data.role;
    if (data.status) updateData.status = data.status;

    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "user.update",
        targetType: "user",
        targetId: id,
        payload: JSON.stringify(updateData),
      },
    });

    return Response.json({ ok: true });
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
