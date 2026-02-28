import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// DELETE /api/admin/tokens/[id] — revoke a token
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { id } = await params;

    const token = await prisma.apiToken.findUnique({ where: { id } });
    if (!token) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    await prisma.apiToken.update({
      where: { id },
      data: { status: "revoked" },
    });

    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "token.revoke",
        targetType: "apiToken",
        targetId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
