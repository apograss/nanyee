import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";

// GET /api/admin/users — list all users with optional search
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();

    const where = q
      ? {
          OR: [
            { username: { contains: q } },
            { email: { contains: q } },
            { nickname: { contains: q } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return Response.json({
      ok: true,
      data: {
        users: users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
