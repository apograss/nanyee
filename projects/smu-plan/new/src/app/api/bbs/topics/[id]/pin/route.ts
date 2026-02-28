import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const pinSchema = z.object({
  pinned: z.boolean(),
});

// PATCH /api/bbs/topics/[id]/pin — toggle pin (admin only)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await requireAdmin(req);
    const body = await req.json();
    const { pinned } = pinSchema.parse(body);

    const topic = await prisma.bbsTopic.findUnique({ where: { id }, select: { id: true } });
    if (!topic) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Topic not found" } },
        { status: 404 }
      );
    }

    const updated = await prisma.bbsTopic.update({
      where: { id },
      data: { pinned },
    });

    return Response.json({ ok: true, data: { topic: updated } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
