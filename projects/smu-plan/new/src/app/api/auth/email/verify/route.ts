import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { z } from "zod";

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(["register", "reset"]).default("register"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code, purpose } = verifySchema.parse(body);

    const verification = await prisma.emailVerification.findFirst({
      where: {
        email,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!verification) {
      return Response.json(
        { ok: false, error: { code: 400, message: "No valid code found" } },
        { status: 400 }
      );
    }

    const valid = await compare(code, verification.codeHash);
    if (!valid) {
      return Response.json(
        { ok: false, error: { code: 400, message: "Invalid code" } },
        { status: 400 }
      );
    }

    // Don't mark as used yet — register route will mark it
    return Response.json({
      ok: true,
      data: { verified: true, email },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: 400, message: err.errors[0]?.message || "Validation failed" } },
        { status: 400 }
      );
    }
    console.error("Email verify error:", err);
    return Response.json(
      { ok: false, error: { code: 500, message: "Internal Server Error" } },
      { status: 500 }
    );
  }
}
