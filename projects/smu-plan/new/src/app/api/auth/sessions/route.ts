import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { verifyRefreshToken } from "@/lib/auth/jwt";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    // Get current session ID from refresh token
    const refreshToken = req.cookies.get("refresh_token")?.value;
    let currentSessionId: string | null = null;
    if (refreshToken) {
      const payload = await verifyRefreshToken(refreshToken);
      if (payload?.sid) currentSessionId = payload.sid;
    }

    const sessions = await prisma.session.findMany({
      where: {
        userId: ctx.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });

    return Response.json({
      ok: true,
      data: {
        sessions: sessions.map((s) => ({
          ...s,
          isCurrent: s.id === currentSessionId,
        })),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
