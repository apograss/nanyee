import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import quizBank from "@/data/quiz-bank.json";

const QUIZ_COUNT = 20;
const QUIZ_PASS_RATE = 0.9;

const emailVerifySchema = z.object({ code: z.string().length(6) });
const quizVerifySchema = z.object({
  answers: z.array(z.number()).length(QUIZ_COUNT),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const challenge = await prisma.registrationChallenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Challenge not found" } },
        { status: 404 },
      );
    }

    if (challenge.consumedAt) {
      return Response.json(
        {
          ok: false,
          error: { code: 410, message: "Challenge already consumed" },
        },
        { status: 410 },
      );
    }

    if (challenge.expiresAt < new Date()) {
      return Response.json(
        { ok: false, error: { code: 410, message: "Challenge expired" } },
        { status: 410 },
      );
    }

    if (challenge.verifiedAt) {
      return Response.json({
        ok: true,
        data: {
          challengeId: challenge.id,
          method: challenge.method,
          status: "verified",
        },
      });
    }

    if (challenge.verifyAttempts >= 5) {
      return Response.json(
        {
          ok: false,
          error: { code: 429, message: "尝试次数过多，请重新获取验证挑战" },
        },
        { status: 429 },
      );
    }

    await prisma.registrationChallenge.update({
      where: { id },
      data: { verifyAttempts: { increment: 1 } },
    });

    const body = await req.json();

    if (challenge.method === "email") {
      const { code } = emailVerifySchema.parse(body);

      const verification = await prisma.emailVerification.findFirst({
        where: {
          email: challenge.email!,
          purpose: "register",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!verification) {
        return Response.json(
          { ok: false, error: { code: 400, message: "验证码无效或已过期" } },
          { status: 400 },
        );
      }

      const valid = await compare(code, verification.codeHash);
      if (!valid) {
        return Response.json(
          { ok: false, error: { code: 400, message: "验证码不正确" } },
          { status: 400 },
        );
      }

      await prisma.$transaction([
        prisma.emailVerification.update({
          where: { id: verification.id },
          data: { usedAt: new Date() },
        }),
        prisma.registrationChallenge.update({
          where: { id },
          data: { verifiedAt: new Date() },
        }),
      ]);

      return Response.json({
        ok: true,
        data: {
          challengeId: challenge.id,
          method: "email",
          status: "verified",
          email: challenge.email,
        },
      });
    }

    const { answers } = quizVerifySchema.parse(body);
    const pickedIndices: number[] = JSON.parse(challenge.questionIdsJson!);

    let score = 0;
    for (let index = 0; index < pickedIndices.length; index++) {
      const bankItem = quizBank[pickedIndices[index]];
      if (bankItem && answers[index] === bankItem.correctAnswer) {
        score++;
      }
    }

    const passThreshold = Math.ceil(QUIZ_COUNT * QUIZ_PASS_RATE);

    if (score < passThreshold) {
      return Response.json(
        {
          ok: false,
          error: {
            code: 400,
            message: `答题未通过：${score}/${QUIZ_COUNT}，需要至少答对 ${passThreshold} 题`,
          },
          data: { score, total: QUIZ_COUNT, passThreshold },
        },
        { status: 400 },
      );
    }

    await prisma.registrationChallenge.update({
      where: { id },
      data: { verifiedAt: new Date() },
    });

    return Response.json({
      ok: true,
      data: {
        challengeId: challenge.id,
        method: "quiz",
        status: "verified",
        score,
        total: QUIZ_COUNT,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        {
          ok: false,
          error: { code: 400, message: err.errors[0]?.message || "参数错误" },
        },
        { status: 400 },
      );
    }

    console.error("Challenge verify error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 },
    );
  }
}
