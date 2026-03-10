import { NextRequest } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";
import { prisma } from "@/lib/prisma";

export interface AuthContext {
  userId: string;
  role: string;
  username: string;
}

interface UserAccessRecord {
  id: string;
  role: string;
  status: string;
  username: string;
}

export function coerceActiveUserContext(
  user: UserAccessRecord | null,
): AuthContext | null {
  if (!user || user.status !== "active") {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    username: user.username,
  };
}

export async function getAuthContext(
  req: NextRequest
): Promise<AuthContext | null> {
  const token = req.cookies.get("access_token")?.value;
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      status: true,
      username: true,
    },
  });

  return coerceActiveUserContext(user);
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
