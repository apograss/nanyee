import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { revokeSession } from "@/lib/auth/session";
import { clearAuthCookies } from "@/lib/auth/cookies";

export async function POST(req: NextRequest) {
  try {
    const refreshTokenCookie = req.cookies.get("refresh_token")?.value;

    if (refreshTokenCookie) {
      const payload = await verifyRefreshToken(refreshTokenCookie);
      if (payload?.sid) {
        await revokeSession(payload.sid);
      }
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    return clearAuthCookies(res);
  } catch {
    const res = NextResponse.json({ ok: true }, { status: 200 });
    return clearAuthCookies(res);
  }
}
