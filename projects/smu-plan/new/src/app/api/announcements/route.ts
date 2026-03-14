import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const announcements = await prisma.announcement.findMany({
      where: { active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, content: true, createdAt: true, updatedAt: true, priority: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        announcement: announcements[0] ?? null,
        announcements,
      },
    });
  } catch (err) {
    console.error("Failed to fetch announcements:", err);
    return NextResponse.json({ ok: true, data: { announcement: null, announcements: [] } });
  }
}
