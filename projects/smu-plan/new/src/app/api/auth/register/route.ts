import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { issueUserSession } from "@/lib/auth/session";

const registerSchema = z.object({
  challengeId: z.string().min(1),
  username: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  nickname: z.string().min(1).max(30).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const challenge = await prisma.registrationChallenge.findUnique({
      where: { id: data.challengeId },
    });

    if (!challenge) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Challenge not found" } },
        { status: 404 }
      );
    }

    // Check username taken
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      return Response.json(
        { ok: false, error: { code: 409, message: "Username already taken" } },
        { status: 409 }
      );
    }

    // For email challenges, check email not taken
    if (challenge.method === "email" && challenge.email) {
      const emailUser = await prisma.user.findUnique({
        where: { email: challenge.email },
      });
      if (emailUser) {
        return Response.json(
          { ok: false, error: { code: 409, message: "Email already registered" } },
          { status: 409 }
        );
      }
    }

    // Create user
    const passwordHash = await hash(data.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const freshChallenge = await tx.registrationChallenge.findUnique({
        where: { id: data.challengeId },
      });

      if (!freshChallenge) {
        throw new Error("challenge_not_found");
      }
      if (freshChallenge.consumedAt) {
        throw new Error("challenge_already_consumed");
      }
      if (freshChallenge.expiresAt < new Date()) {
        throw new Error("challenge_expired");
      }
      if (!freshChallenge.verifiedAt) {
        throw new Error("challenge_not_verified");
      }

      const createdUser = await tx.user.create({
        data: {
          username: data.username,
          passwordHash,
          nickname: data.nickname || data.username,
          email: freshChallenge.method === "email" ? freshChallenge.email : null,
          emailVerifiedAt: freshChallenge.method === "email" ? new Date() : null,
          role: "contributor",
          status: "active",
        },
      });

      const consumeResult = await tx.registrationChallenge.updateMany({
        where: { id: freshChallenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (consumeResult.count !== 1) {
        throw new Error("challenge_already_consumed");
      }

      return createdUser;
    });

    // Issue session using shared utility (fixes the refresh token hash bug)
    return issueUserSession(
      req,
      user,
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
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    if (err instanceof Error) {
      const challengeMessages: Record<string, { status: number; message: string }> = {
        challenge_not_found: { status: 404, message: "Challenge not found" },
        challenge_already_consumed: { status: 400, message: "Challenge already used" },
        challenge_expired: { status: 400, message: "Challenge expired" },
        challenge_not_verified: { status: 400, message: "Challenge not verified" },
      };
      const challengeError = challengeMessages[err.message];
      if (challengeError) {
        return Response.json(
          { ok: false, error: { code: challengeError.status, message: challengeError.message } },
          { status: challengeError.status }
        );
      }
    }
    console.error("Register error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
