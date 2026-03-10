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

    // Atomically consume the challenge
    const challenge = await prisma.$transaction(async (tx) => {
      const ch = await tx.registrationChallenge.findUnique({
        where: { id: data.challengeId },
      });

      if (!ch) return null;
      if (ch.consumedAt) return { ...ch, _error: "already_consumed" as const };
      if (ch.expiresAt < new Date()) return { ...ch, _error: "expired" as const };
      if (!ch.verifiedAt) return { ...ch, _error: "not_verified" as const };

      // Mark consumed
      await tx.registrationChallenge.update({
        where: { id: ch.id },
        data: { consumedAt: new Date() },
      });

      return ch;
    });

    if (!challenge) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Challenge not found" } },
        { status: 404 }
      );
    }

    if ("_error" in challenge) {
      const messages: Record<string, string> = {
        already_consumed: "Challenge already used",
        expired: "Challenge expired",
        not_verified: "Challenge not verified",
      };
      return Response.json(
        { ok: false, error: { code: 400, message: messages[challenge._error] } },
        { status: 400 }
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
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        nickname: data.nickname || data.username,
        email: challenge.method === "email" ? challenge.email : null,
        emailVerifiedAt: challenge.method === "email" ? new Date() : null,
        role: "contributor",
        status: "active",
      },
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
    console.error("Register error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
