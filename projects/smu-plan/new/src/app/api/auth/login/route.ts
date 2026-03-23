import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { issueUserSession } from "@/lib/auth/session";
import { signTwoFactorChallenge } from "@/lib/auth/two-factor";
import { checkAuthRateLimit } from "@/lib/rate-limiter";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed, retryAfterMs } = checkAuthRateLimit(ip);
    if (!allowed) {
      return Response.json(
        { ok: false, error: { code: 429, message: "Too many login attempts, please try later" } },
        { status: 429, headers: { "Retry-After": String(Math.ceil((retryAfterMs || 60000) / 1000)) } }
      );
    }

    const body = await req.json();
    const data = loginSchema.parse(body);

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          { email: data.username },
        ],
      },
      include: {
        twoFactor: {
          select: {
            enabledAt: true,
          },
        },
      },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    const valid = await compare(data.password, user.passwordHash);
    if (!valid || user.status !== "active") {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    if (user.twoFactor?.enabledAt) {
      const challengeId = await signTwoFactorChallenge({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      return Response.json({
        ok: true,
        data: {
          requiresTwoFactor: true,
          challengeId,
          user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            role: user.role,
          },
        },
      });
    }

    return issueUserSession(req, user, {
      ok: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          role: user.role,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid input" } },
        { status: 400 }
      );
    }
    console.error("Login error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
