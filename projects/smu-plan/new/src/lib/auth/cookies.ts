import { NextResponse } from "next/server";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
): NextResponse {
  res.cookies.set("access_token", tokens.accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60, // 15 minutes
  });

  res.cookies.set("refresh_token", tokens.refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return res;
}

export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set("access_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
  res.cookies.set("refresh_token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
