import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";
import slugify from "slugify";

const registerSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  nickname: z.string().min(1).max(30).optional(),
  method: z.enum(["email", "quiz"]),
  email: z.string().email().optional(),
  emailCode: z.string().optional(),
  quizAnswers: z.array(z.number()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Check if username taken
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      return Response.json(
        { ok: false, error: { code: 409, message: "Username already taken" } },
        { status: 409 }
      );
    }

    // Verify registration method
    if (data.method === "email") {
      if (!data.email || !data.emailCode) {
        return Response.json(
          { ok: false, error: { code: 400, message: "Email and code required" } },
          { status: 400 }
        );
      }

      // Check email not taken
      const emailUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailUser) {
        return Response.json(
          { ok: false, error: { code: 409, message: "Email already registered" } },
          { status: 409 }
        );
      }

      // Verify email code
      const verification = await prisma.emailVerification.findFirst({
        where: {
          email: data.email,
          purpose: "register",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!verification) {
        return Response.json(
          { ok: false, error: { code: 400, message: "Invalid or expired code" } },
          { status: 400 }
        );
      }

      const { compare } = await import("bcryptjs");
      const valid = await compare(data.emailCode, verification.codeHash);
      if (!valid) {
        return Response.json(
          { ok: false, error: { code: 400, message: "Invalid verification code" } },
          { status: 400 }
        );
      }

      // Mark verification as used
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });
    } else if (data.method === "quiz") {
      if (!data.quizAnswers || data.quizAnswers.length < 4) {
        return Response.json(
          { ok: false, error: { code: 400, message: "4 quiz answers required" } },
          { status: 400 }
        );
      }

      // Verify quiz answers
      const questions = await prisma.quizQuestion.findMany({
        where: { active: true },
        take: 4,
      });

      if (questions.length < 4) {
        return Response.json(
          { ok: false, error: { code: 500, message: "Not enough quiz questions" } },
          { status: 500 }
        );
      }

      let score = 0;
      for (let i = 0; i < questions.length; i++) {
        if (data.quizAnswers[i] === questions[i].answer) score++;
      }

      if (score < 4) {
        return Response.json(
          { ok: false, error: { code: 400, message: `Quiz failed: ${score}/4` } },
          { status: 400 }
        );
      }
    }

    // Create user
    const passwordHash = await hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        nickname: data.nickname || data.username,
        email: data.method === "email" ? data.email : null,
        emailVerifiedAt: data.method === "email" ? new Date() : null,
        role: "contributor",
        status: "active",
      },
    });

    // Create session and tokens
    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      username: user.username,
    });
    const refreshToken = await signRefreshToken({
      userId: user.id,
      sessionId: "", // will be set below
    });

    const session = await createSession(user.id, refreshToken, {
      ip: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    // Re-sign refresh token with session ID
    const finalRefreshToken = await signRefreshToken({
      userId: user.id,
      sessionId: session.id,
    });

    const res = Response.json(
      {
        ok: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            role: user.role,
          },
        },
      },
      { status: 201 }
    );

    const nextRes = new (await import("next/server")).NextResponse(res.body, res);
    return setAuthCookies(nextRes, {
      accessToken,
      refreshToken: finalRefreshToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    console.error("Register error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
