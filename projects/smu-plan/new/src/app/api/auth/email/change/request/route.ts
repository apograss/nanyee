import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { sendVerificationEmail } from "@/lib/mail/resend";

const schema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const data = schema.parse(body);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { email: true, passwordHash: true },
    });

    if (!user.email) {
      return Response.json(
        { ok: false, error: { code: 400, message: "No email bound. Use bind instead." } },
        { status: 400 }
      );
    }

    const valid = await compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "密码不正确" } },
        { status: 400 }
      );
    }

    // Check new email not taken
    const existing = await prisma.user.findUnique({ where: { email: data.newEmail } });
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

    // Generate codes for both old and new email
    const oldCode = String(Math.floor(100000 + Math.random() * 900000));
    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    const oldCodeHash = await hash(oldCode, 10);
    const newCodeHash = await hash(newCode, 10);

    await prisma.$transaction([
      prisma.emailVerification.create({
        data: { email: user.email, codeHash: oldCodeHash, purpose: "register", expiresAt },
      }),
      prisma.emailVerification.create({
        data: { email: data.newEmail, codeHash: newCodeHash, purpose: "register", expiresAt },
      }),
    ]);

    const request = await prisma.emailChangeRequest.create({
      data: {
        userId: ctx.userId,
        currentEmail: user.email,
        newEmail: data.newEmail,
        expiresAt,
        ip: req.headers.get("x-forwarded-for") || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    // Send both emails
    if (process.env.RESEND_API_KEY) {
      await Promise.all([
        sendVerificationEmail({ to: user.email, code: oldCode, purpose: "change_old" }),
        sendVerificationEmail({ to: data.newEmail, code: newCode, purpose: "change_new" }),
      ]);
    } else {
      console.log(`[DEV] Email change old code for ${user.email}: ${oldCode}`);
      console.log(`[DEV] Email change new code for ${data.newEmail}: ${newCode}`);
    }

    const maskEmail = (e: string) =>
      e.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "*") + c);

    return Response.json({
      ok: true,
      data: {
        requestId: request.id,
        currentEmailMasked: maskEmail(user.email),
        newEmailMasked: maskEmail(data.newEmail),
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
