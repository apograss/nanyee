import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import {
  allowVerificationMailDevFallback,
  isVerificationMailConfigured,
  sendVerificationEmail,
} from "@/lib/mail/resend";
import { buildVerificationRecordInput } from "@/lib/auth/verification-records";

const schema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    // Only users without email can bind
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { email: true, passwordHash: true },
    });

    if (user.email) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Already have email bound. Use change instead." } },
        { status: 400 }
      );
    }

    // Verify password
    const valid = await compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "密码不正确" } },
        { status: 400 }
      );
    }

    // Check email not taken
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return Response.json(
        { ok: false, error: { code: 409, message: "Email already registered" } },
        { status: 409 }
      );
    }

    // Rate limit
    const recent = await prisma.emailChangeRequest.findFirst({
      where: {
        userId: ctx.userId,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recent) {
      return Response.json(
        { ok: false, error: { code: 429, message: "Please wait 60 seconds" } },
        { status: 429 }
      );
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Generate code and store
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(code, 10);

    const request = await prisma.emailChangeRequest.create({
      data: {
        userId: ctx.userId,
        currentEmail: null,
        newEmail: data.email,
        expiresAt,
        ip: req.headers.get("x-forwarded-for") || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    await prisma.emailVerification.create({
      data: buildVerificationRecordInput({
        email: data.email,
        codeHash,
        purpose: "bind",
        requestId: request.id,
        expiresAt,
      }),
    });

    // Send verification email
    if (isVerificationMailConfigured()) {
      try {
        await sendVerificationEmail({ to: data.email, code, purpose: "bind" });
      } catch (err) {
        console.error("Failed to send bind verification email:", err);
        return Response.json(
          { ok: false, error: { code: 500, message: "邮箱验证码发送失败，请稍后再试" } },
          { status: 500 },
        );
      }
    } else if (allowVerificationMailDevFallback()) {
      console.log(`[DEV] Email bind code for ${data.email}: ${code}`);
    } else {
      return Response.json(
        { ok: false, error: { code: 500, message: "邮箱验证码服务未配置，请联系管理员" } },
        { status: 500 },
      );
    }

    const masked = data.email.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) =>
      a + b.replace(/./g, "*") + c
    );

    return Response.json({
      ok: true,
      data: {
        requestId: request.id,
        maskedEmail: masked,
        expiresAt: expiresAt.toISOString(),
        resendAt: new Date(Date.now() + 60_000).toISOString(),
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
