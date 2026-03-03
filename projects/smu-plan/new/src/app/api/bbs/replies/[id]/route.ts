import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

const editReplySchema = z.object({
  content: z.string().min(1).max(5000),
});

// PATCH /api/bbs/replies/[id] — edit a reply
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);
    const body = await req.json();
    const { content } = editReplySchema.parse(body);

    const reply = await prisma.bbsReply.findUnique({ where: { id } });
    if (!reply) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Reply not found" } },
        { status: 404 }
      );
    }

    if (reply.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    await prisma.bbsReply.update({
      where: { id },
      data: { content },
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
