import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    return Response.json(
      { ok: false, error: { code: 401, message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!user) {
    return Response.json(
      { ok: false, error: { code: 404, message: "User not found" } },
      { status: 404 }
    );
  }

  return Response.json({ ok: true, data: { user } });
}
