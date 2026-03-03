import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: { id: true, content: true },
    });

    return NextResponse.json({ ok: true, data: { announcement } });
  } catch {
    return NextResponse.json({ ok: true, data: { announcement: null } });
  }
}
