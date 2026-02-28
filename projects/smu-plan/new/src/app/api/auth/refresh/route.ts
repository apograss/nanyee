import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { findActiveSession, rotateSession } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";

export async function POST(req: NextRequest) {
  try {
    const refreshTokenCookie = req.cookies.get("refresh_token")?.value;
    if (!refreshTokenCookie) {
      return Response.json(
        { ok: false, error: { code: 401, message: "No refresh token" } },
        { status: 401 }
      );
    }

    const payload = await verifyRefreshToken(refreshTokenCookie);
    if (!payload?.sub || !payload?.sid) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid refresh token" } },
        { status: 401 }
      );
    }

    const session = await findActiveSession(payload.sid);
    if (!session) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Session expired or revoked" } },
        { status: 401 }
      );
    }

    // Verify refresh token hash
    const valid = await compare(refreshTokenCookie, session.refreshTokenHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Token mismatch" } },
        { status: 401 }
      );
    }

    // Issue new tokens
    const accessToken = await signAccessToken({
      userId: session.user.id,
      role: session.user.role,
      username: session.user.username,
    });

    const newRefreshToken = await signRefreshToken({
      userId: session.user.id,
      sessionId: session.id,
    });

    // Rotate session
    await rotateSession(session.id, newRefreshToken);

    const res = NextResponse.json({ ok: true }, { status: 200 });
    return setAuthCookies(res, {
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error("Refresh error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
