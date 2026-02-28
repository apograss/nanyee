import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

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

export async function revokeSession(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function rotateSession(
  sessionId: string,
  newRefreshToken: string
) {
  const refreshTokenHash = await hash(newRefreshToken, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return prisma.session.update({
    where: { id: sessionId },
    data: { refreshTokenHash, expiresAt },
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
