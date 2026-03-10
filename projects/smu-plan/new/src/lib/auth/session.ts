import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { signAccessToken, signRefreshToken } from "./jwt";
import { setAuthCookies } from "./cookies";

export async function createSession(
  userId: string,
  refreshToken: string,
  ctx: { ip?: string; userAgent?: string }
) {
  const refreshTokenHash = await hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  return prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      ip: ctx.ip || null,
      userAgent: ctx.userAgent || null,
      expiresAt,
    },
  });
}

export async function revokeSession(
  sessionId: string,
  reason?: string
) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date(), revokedReason: reason || null },
  });
}

export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string,
  reason: string
) {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      id: { not: keepSessionId },
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (sessions.length === 0) return 0;

  await prisma.session.updateMany({
    where: {
      id: { in: sessions.map((s) => s.id) },
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });

  return sessions.length;
}

export async function rotateSession(
  sessionId: string,
  newRefreshToken: string
) {
  const refreshTokenHash = await hash(newRefreshToken, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return prisma.session.update({
    where: { id: sessionId },
    data: { refreshTokenHash, expiresAt, lastSeenAt: new Date() },
  });
}

export async function findActiveSession(sessionId: string) {
  return prisma.session.findFirst({
    where: {
      id: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
}

/**
 * Unified session issuance for login and register.
 * Creates session, signs tokens, sets cookies.
 * Returns the NextResponse with auth cookies set.
 */
export async function issueUserSession(
  req: NextRequest,
  user: { id: string; role: string; username: string },
  responseBody: Record<string, unknown>,
  statusCode = 200
): Promise<NextResponse> {
  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    username: user.username,
  });

  // Create session with placeholder hash first
  const session = await createSession(user.id, "placeholder", {
    ip: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  });

  // Sign refresh token with session id
  const refreshToken = await signRefreshToken({
    userId: user.id,
    sessionId: session.id,
  });

  // Update session with real refresh token hash
  const refreshTokenHash = await hash(refreshToken, 10);
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash },
  });

  const res = NextResponse.json(responseBody, { status: statusCode });
  return setAuthCookies(res, { accessToken, refreshToken });
}
