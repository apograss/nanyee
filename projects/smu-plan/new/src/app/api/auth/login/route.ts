import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";
import { issueUserSession } from "@/lib/auth/session";

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

    const valid = await compare(data.password, user.passwordHash);
    if (!valid || user.status !== "active") {
      return Response.json(
        { ok: false, error: { code: 401, message: "Invalid credentials" } },
        { status: 401 }
      );
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
