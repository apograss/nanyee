import { NextRequest } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { revokeOtherSessions } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const refreshToken = req.cookies.get("refresh_token")?.value;
    if (!refreshToken) {
      return Response.json(
        { ok: false, error: { code: 401, message: "No session" } },
        { status: 401 }
      );
    }

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload?.sid) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid session" } },
        { status: 401 }
      );
    }

    const revokedCount = await revokeOtherSessions(
      ctx.userId,
      payload.sid,
      "revoke_other_sessions"
    );

    return Response.json({
      ok: true,
      data: { revokedCount, keptSessionId: payload.sid },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
