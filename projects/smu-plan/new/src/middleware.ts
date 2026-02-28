import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-in-production!!"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin route protection
  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("access_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login?redirect=/admin", req.url));
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role !== "admin") {
        return NextResponse.redirect(new URL("/", req.url));
      }
    } catch {
      // Token expired or invalid — try refresh via client-side
      return NextResponse.redirect(new URL("/login?redirect=/admin", req.url));
    }
  }

  // Admin API route protection
  if (pathname.startsWith("/api/admin")) {
    const token = req.cookies.get("access_token")?.value;

    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.role !== "admin") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Token expired" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
