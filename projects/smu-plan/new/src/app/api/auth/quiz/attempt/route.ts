import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const quizSchema = z.object({
  // Client sends answers for the questions returned by GET
  answers: z.array(z.number()).min(4).max(4),
});

// GET: fetch quiz questions for registration
export async function GET() {
  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { active: true },
    });

    if (questions.length < 4) {
      return Response.json(
        { ok: false, error: { code: 503, message: "Not enough quiz questions available" } },
        { status: 503 }
      );
    }

    // Shuffle and pick 4
    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, 4);

    return Response.json({
      ok: true,
      data: {
        questions: shuffled.map((q) => ({
          id: q.id,
          question: q.question,
          options: JSON.parse(q.options),
        })),
      },
    });
  } catch (err) {
    console.error("Quiz fetch error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}

// POST: verify quiz answers (pre-check before register)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { answers } = quizSchema.parse(body);

    // The answers array should match question order.
    // Client must send questionIds alongside answers for proper matching.
    const questionIds = body.questionIds as string[] | undefined;
    if (!questionIds || questionIds.length !== 4) {
      return Response.json(
        { ok: false, error: { code: 400, message: "questionIds required" } },
        { status: 400 }
      );
    }

    const questions = await prisma.quizQuestion.findMany({
      where: { id: { in: questionIds } },
    });

    if (questions.length < 4) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid question IDs" } },
        { status: 400 }
      );
    }

    // Build a map for O(1) lookup
    const qMap = new Map(questions.map((q) => [q.id, q.answer]));

    let score = 0;
    for (let i = 0; i < questionIds.length; i++) {
      const correctAnswer = qMap.get(questionIds[i]);
      if (correctAnswer !== undefined && answers[i] === correctAnswer) {
        score++;
      }
    }

    const passed = score >= 4;

    return Response.json({
      ok: true,
      data: { score, total: 4, passed },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    console.error("Quiz attempt error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
