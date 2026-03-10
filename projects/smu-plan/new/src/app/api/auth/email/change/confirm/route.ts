import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { revokeOtherSessions } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";

const schema = z.object({
  requestId: z.string().min(1),
  oldCode: z.string().length(6),
  newCode: z.string().length(6),
  revokeOtherSessions: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    const request = await prisma.emailChangeRequest.findUnique({
      where: { id: data.requestId },
    });

    if (!request || request.userId !== ctx.userId) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Request not found" } },
        { status: 404 }
      );
    }

    if (request.consumedAt || request.cancelledAt) {
      return Response.json(
        { ok: false, error: { code: 410, message: "Request already used" } },
        { status: 410 }
      );
    }

    if (request.expiresAt < new Date()) {
      return Response.json(
        { ok: false, error: { code: 410, message: "Request expired" } },
        { status: 410 }
      );
    }

    if (request.verifyAttemptsOld >= 5 || request.verifyAttemptsNew >= 5) {
      return Response.json(
        { ok: false, error: { code: 429, message: "Too many attempts" } },
        { status: 429 }
      );
    }

    await prisma.emailChangeRequest.update({
      where: { id: data.requestId },
      data: {
        verifyAttemptsOld: { increment: 1 },
        verifyAttemptsNew: { increment: 1 },
      },
    });

    // Verify old email code
    const oldVerification = await prisma.emailVerification.findFirst({
      where: {
        email: request.currentEmail!,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!oldVerification) {
      return Response.json(
        { ok: false, error: { code: 400, message: "旧邮箱验证码无效或已过期" } },
        { status: 400 }
      );
    }

    const oldValid = await compare(data.oldCode, oldVerification.codeHash);
    if (!oldValid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "旧邮箱验证码不正确" } },
        { status: 400 }
      );
    }

    // Verify new email code
    const newVerification = await prisma.emailVerification.findFirst({
      where: {
        email: request.newEmail,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!newVerification) {
      return Response.json(
        { ok: false, error: { code: 400, message: "新邮箱验证码无效或已过期" } },
        { status: 400 }
      );
    }

    const newValid = await compare(data.newCode, newVerification.codeHash);
    if (!newValid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "新邮箱验证码不正确" } },
        { status: 400 }
      );
    }

    // Atomically change email
    const now = new Date();
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: oldVerification.id },
        data: { usedAt: now },
      }),
      prisma.emailVerification.update({
        where: { id: newVerification.id },
        data: { usedAt: now },
      }),
      prisma.emailChangeRequest.update({
        where: { id: data.requestId },
        data: { oldEmailVerifiedAt: now, newEmailVerifiedAt: now, consumedAt: now },
      }),
      prisma.user.update({
        where: { id: ctx.userId },
        data: { email: request.newEmail, emailVerifiedAt: now },
      }),
    ]);

    // Revoke other sessions if requested
    let revokedCount = 0;
    if (data.revokeOtherSessions) {
      const refreshToken = req.cookies.get("refresh_token")?.value;
      const payload = refreshToken ? await verifyRefreshToken(refreshToken) : null;
      if (payload?.sid) {
        revokedCount = await revokeOtherSessions(
          ctx.userId,
          payload.sid,
          "email_changed"
        );
      }
    }

    return Response.json({
      ok: true,
      data: {
        email: request.newEmail,
        emailVerifiedAt: now.toISOString(),
        revokedCount,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid input" } },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
