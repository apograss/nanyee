import { NextRequest } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";

export interface AuthContext {
  userId: string;
  role: string;
  username: string;
}

export async function getAuthContext(
  req: NextRequest
): Promise<AuthContext | null> {
  const token = req.cookies.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;

  return {
    userId: payload.sub,
    role: payload.role,
    username: payload.username,
  };
}

export async function requireUser(req: NextRequest): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) {
    throw new AuthError("Unauthorized", 401);
  }
  return ctx;
}

export async function requireAdmin(req: NextRequest): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (ctx.role !== "admin") {
    throw new AuthError("Forbidden", 403);
  }
  return ctx;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

export function handleAuthError(err: unknown) {
  if (err instanceof AuthError) {
    return Response.json(
      { ok: false, error: { code: err.status, message: err.message } },
      { status: err.status }
    );
  }
  console.error("API Error caught by handleAuthError:", err);
  return Response.json(
    { ok: false, error: { code: 500, message: "Internal Server Error" } },
    { status: 500 }
  );
}
