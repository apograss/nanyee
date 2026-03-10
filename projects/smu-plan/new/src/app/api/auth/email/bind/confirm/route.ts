import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { buildVerificationLookup } from "@/lib/auth/verification-records";

const schema = z.object({
  requestId: z.string().min(1),
  code: z.string().length(6),
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

    if (request.verifyAttemptsNew >= 5) {
      return Response.json(
        { ok: false, error: { code: 429, message: "Too many attempts" } },
        { status: 429 }
      );
    }

    await prisma.emailChangeRequest.update({
      where: { id: data.requestId },
      data: { verifyAttemptsNew: { increment: 1 } },
    });

    // Verify code against EmailVerification
    const verification = await prisma.emailVerification.findFirst({
      where: buildVerificationLookup(
        {
          email: request.newEmail,
          purpose: "bind",
          requestId: request.id,
        },
        new Date(),
      ),
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid or expired code" } },
        { status: 400 }
      );
    }

    const valid = await compare(data.code, verification.codeHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid verification code" } },
        { status: 400 }
      );
    }

    // Atomically bind email
    const now = new Date();
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: now },
      }),
      prisma.emailChangeRequest.update({
        where: { id: data.requestId },
        data: { newEmailVerifiedAt: now, consumedAt: now },
      }),
      prisma.user.update({
        where: { id: ctx.userId },
        data: { email: request.newEmail, emailVerifiedAt: now },
      }),
    ]);

    return Response.json({
      ok: true,
      data: {
        email: request.newEmail,
        emailVerifiedAt: now.toISOString(),
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
