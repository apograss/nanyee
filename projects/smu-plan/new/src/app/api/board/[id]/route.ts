import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";

// DELETE /api/board/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Not found" } },
        { status: 404 }
      );
    }

    // Only author or admin can delete
    if (message.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    await prisma.message.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
