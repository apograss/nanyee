import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { revokeSession } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireUser(req);
    const { id } = await params;

    // Verify session belongs to user
    const session = await prisma.session.findFirst({
      where: { id, userId: ctx.userId, revokedAt: null },
    });

    if (!session) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Session not found" } },
        { status: 404 }
      );
    }

    await revokeSession(id, "logout");

    // Check if revoking current session
    const refreshToken = req.cookies.get("refresh_token")?.value;
    if (refreshToken) {
      const payload = await verifyRefreshToken(refreshToken);
      if (payload?.sid === id) {
        const res = NextResponse.json({
          ok: true,
          data: { revokedSessionId: id, currentSessionRevoked: true },
        });
        return clearAuthCookies(res);
      }
    }

    return Response.json({
      ok: true,
      data: { revokedSessionId: id },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
