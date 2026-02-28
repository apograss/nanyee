import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
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
    });

    if (!user) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    if (user.status === "banned") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Account is banned" } },
        { status: 403 }
      );
    }

    const valid = await compare(data.password, user.passwordHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid credentials" } },
        { status: 401 }
      );
    }

    // Create tokens
    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      username: user.username,
    });

    const session = await createSession(user.id, "temp", {
      ip: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const refreshToken = await signRefreshToken({
      userId: user.id,
      sessionId: session.id,
    });

    // Update session with real refresh token hash
    const { hash } = await import("bcryptjs");
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: await hash(refreshToken, 10) },
    });

    const res = NextResponse.json(
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
      { status: 200 }
    );

    return setAuthCookies(res, { accessToken, refreshToken });
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
