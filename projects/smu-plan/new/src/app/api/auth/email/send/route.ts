import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const sendSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["register", "reset"]).default("register"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, purpose } = sendSchema.parse(body);

    // Rate limit: max 1 code per email per 60s
    const recent = await prisma.emailVerification.findFirst({
      where: {
        email,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recent) {
      return Response.json(
        { ok: false, error: { code: 429, message: "Please wait 60 seconds" } },
        { status: 429 }
      );
    }

    // If registering, check email not already registered
    if (purpose === "register") {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return Response.json(
          { ok: false, error: { code: 409, message: "Email already registered" } },
          { status: 409 }
        );
      }
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(code, 10);

    await prisma.emailVerification.create({
      data: {
        email,
        codeHash,
        purpose,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      },
    });

    // Send email via SMTP
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || "465");
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (smtpHost && smtpUser && smtpPass) {
      // Dynamic import nodemailer only when SMTP is configured
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `"nanyee.de" <${smtpFrom}>`,
          to: email,
          subject: `[nanyee.de] 验证码: ${code}`,
          text: `您的验证码是: ${code}\n\n10 分钟内有效。如非本人操作请忽略。`,
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1D3557;">nanyee.de 验证码</h2>
              <p style="font-size: 32px; font-weight: bold; color: #E8652B; letter-spacing: 4px;">${code}</p>
              <p style="color: #666;">10 分钟内有效。如非本人操作请忽略此邮件。</p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error("Failed to send email:", mailErr);
        return Response.json(
          { ok: false, error: { code: 500, message: "Failed to send email" } },
          { status: 500 }
        );
      }
    } else {
      // Dev mode: log code to console
      console.log(`[DEV] Email verification code for ${email}: ${code}`);
    }

    return Response.json({ ok: true, data: { message: "Code sent" } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    console.error("Email send error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
