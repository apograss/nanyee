import { NextRequest } from "next/server";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    const latestAnnouncement = await prisma.announcement.findFirst({
      where: { active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: { createdAt: true },
    });

    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        lastReadAnnouncementAt: latestAnnouncement?.createdAt ?? new Date(),
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
