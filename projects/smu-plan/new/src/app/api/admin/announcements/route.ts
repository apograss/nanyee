import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { z } from "zod";

// GET /api/admin/announcements — list all announcements
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const announcements = await prisma.announcement.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return Response.json({
      ok: true,
      data: {
        announcements: announcements.map((a) => ({
          id: a.id,
          content: a.content,
          active: a.active,
          priority: a.priority,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

const createAnnouncementSchema = z.object({
  content: z.string().min(1).max(2000),
  active: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
});

// POST /api/admin/announcements — create a new announcement
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    const body = await req.json();
    const data = createAnnouncementSchema.parse(body);

    const announcement = await prisma.announcement.create({
      data: {
        content: data.content,
        active: data.active,
        priority: data.priority,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: auth.userId,
        action: "announcement.create",
        targetType: "announcement",
        targetId: announcement.id,
        payload: JSON.stringify({ content: data.content }),
      },
    });

    return Response.json(
      {
        ok: true,
        data: {
          id: announcement.id,
          content: announcement.content,
          active: announcement.active,
          priority: announcement.priority,
          createdAt: announcement.createdAt.toISOString(),
          updatedAt: announcement.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
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
