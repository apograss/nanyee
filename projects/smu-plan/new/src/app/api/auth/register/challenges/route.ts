import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import {
  isVerificationMailConfigured,
  sendVerificationEmail,
} from "@/lib/mail/resend";
import quizBank from "@/data/quiz-bank.json";

const QUIZ_COUNT = 20;
const QUIZ_PASS_RATE = 0.9;

const schema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("email"),
    email: z
      .string()
      .email()
      .refine((e) => e.endsWith(".edu.cn"), {
        message: "仅支持 .edu.cn 教育邮箱注册",
      }),
  }),
  z.object({
    method: z.literal("quiz"),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    const ip = req.headers.get("x-forwarded-for") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    if (data.method === "email") {
      // Check email not already taken
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        return Response.json(
          { ok: false, error: { code: 409, message: "该邮箱已被注册" } },
          { status: 409 }
        );
      }

      // Rate limit: 1 challenge per email per 60s
      const recent = await prisma.registrationChallenge.findFirst({
        where: {
          email: data.email,
          method: "email",
          createdAt: { gt: new Date(Date.now() - 60_000) },
        },
      });
      if (recent) {
        return Response.json(
          { ok: false, error: { code: 429, message: "请等待 60 秒后重试" } },
          { status: 429 }
        );
      }

      // Generate verification code
      const code = String(Math.floor(100000 + Math.random() * 900000));

      // Store code hash in EmailVerification
      const codeHash = await hash(code, 10);
      await prisma.emailVerification.create({
        data: {
          email: data.email,
          codeHash,
          purpose: "register",
          expiresAt,
        },
      });

      // Create challenge
      const challenge = await prisma.registrationChallenge.create({
        data: {
          method: "email",
          email: data.email,
          expiresAt,
          ip: ip || null,
          userAgent: userAgent || null,
        },
      });

      // Send verification email
      if (isVerificationMailConfigured()) {
        try {
          await sendVerificationEmail({ to: data.email, code, purpose: "register" });
        } catch (err) {
          console.error("Failed to send verification email:", err);
          return Response.json(
            { ok: false, error: { code: 500, message: "邮件发送失败，请稍后重试" } },
            { status: 500 }
          );
        }
      } else {
        console.log(`[DEV] Registration verification code for ${data.email}: ${code}`);
      }

      const masked = data.email.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) =>
        a + b.replace(/./g, "*") + c
      );

      return Response.json({
        ok: true,
        data: {
          challengeId: challenge.id,
          method: "email",
          maskedEmail: masked,
          expiresAt: expiresAt.toISOString(),
          resendAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    }

    // Quiz method — pick QUIZ_COUNT random questions from JSON quiz bank
    if (quizBank.length < QUIZ_COUNT) {
      return Response.json(
        { ok: false, error: { code: 500, message: "题库题目不足" } },
        { status: 500 }
      );
    }

    // Fisher-Yates shuffle and pick QUIZ_COUNT
    const indices = Array.from({ length: quizBank.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const pickedIndices = indices.slice(0, QUIZ_COUNT);

    const challenge = await prisma.registrationChallenge.create({
      data: {
        method: "quiz",
        questionIdsJson: JSON.stringify(pickedIndices),
        expiresAt,
        ip: ip || null,
        userAgent: userAgent || null,
      },
    });

    return Response.json({
      ok: true,
      data: {
        challengeId: challenge.id,
        method: "quiz",
        questions: pickedIndices.map((idx, i) => ({
          id: String(i), // index within this challenge, not global id
          question: quizBank[idx].content,
          options: quizBank[idx].options,
        })),
        totalQuestions: QUIZ_COUNT,
        passRate: QUIZ_PASS_RATE,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }
    console.error("Challenge creation error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
