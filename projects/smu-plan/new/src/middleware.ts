import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-in-production!!"
);
const CHECK_HOST = process.env.CHECK_PUBLIC_HOST || "check.nanyee.de";
const CHECK_PREFIX = "/check-internal";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const pathWithQuery = `${pathname}${req.nextUrl.search}`;
  const host = req.headers.get("host")?.split(":")[0] || "";
  const isCheckHost = host === CHECK_HOST;

  if (pathname.startsWith("/api/admin")) {
    return verifyAdminApi(req);
  }

  if (pathname.startsWith(CHECK_PREFIX) && !isCheckHost) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isCheckHost && pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const redirect = await verifyAdminPage(req, "/admin/login?redirect=/admin");
    if (redirect) return redirect;
  }

  if (!isCheckHost && pathname.startsWith("/admin")) {
    const redirect = await verifyAdminPage(req, "/login?redirect=/admin");
    if (redirect) return redirect;
  }

  if (isCheckHost) {
    const rewrittenPath = rewriteCheckPath(pathWithQuery);
    if (rewrittenPath) {
      return NextResponse.rewrite(new URL(rewrittenPath, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};

async function verifyAdminPage(req: NextRequest, loginPath: string): Promise<NextResponse | null> {
  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL(loginPath, req.url));
  }

  return null;
}

async function verifyAdminApi(req: NextRequest): Promise<NextResponse> {
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

  return NextResponse.next();
}

function rewriteCheckPath(pathWithQuery: string): string | null {
  if (pathWithQuery.startsWith(CHECK_PREFIX)) return null;
  if (pathWithQuery.startsWith("/api/")) return null;

  if (
    pathWithQuery.startsWith("/_next") ||
    pathWithQuery.startsWith("/favicon") ||
    pathWithQuery.startsWith("/robots") ||
    pathWithQuery.startsWith("/sitemap") ||
    pathWithQuery.startsWith("/assets")
  ) {
    return null;
  }

  if (pathWithQuery === "/") return CHECK_PREFIX;
  return `${CHECK_PREFIX}${pathWithQuery}`;
}
