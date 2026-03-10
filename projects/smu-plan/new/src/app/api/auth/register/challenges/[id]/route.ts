import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import quizBank from "@/data/quiz-bank.json";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const challenge = await prisma.registrationChallenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Challenge not found" } },
        { status: 404 }
      );
    }

    let status: string;
    if (challenge.consumedAt) {
      status = "consumed";
    } else if (challenge.expiresAt < new Date()) {
      status = "expired";
    } else if (challenge.verifiedAt) {
      status = "verified";
    } else {
      status = "pending";
    }

    const data: Record<string, unknown> = {
      challengeId: challenge.id,
      method: challenge.method,
      status,
      expiresAt: challenge.expiresAt.toISOString(),
    };

    if (challenge.method === "email" && challenge.email) {
      data.maskedEmail = challenge.email.replace(
        /^(.{1,2})(.*)(@.*)$/,
        (_, a, b, c) => a + b.replace(/./g, "*") + c
      );
    }

    if (challenge.method === "quiz" && challenge.questionIdsJson && status === "pending") {
      const pickedIndices: number[] = JSON.parse(challenge.questionIdsJson);
      data.questions = pickedIndices.map((idx, i) => ({
        id: String(i),
        question: quizBank[idx].content,
        options: quizBank[idx].options,
      }));
    }

    return Response.json({ ok: true, data });
  } catch (err) {
    console.error("Challenge GET error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
