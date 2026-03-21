import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { encryptKey } from "@/lib/keys/selector";

// GET — Get current user's eval task
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const task = await prisma.evalTask.findUnique({
      where: { userId: ctx.userId },
      select: {
        id: true,
        smuAccount: true,
        enabled: true,
        lastRunAt: true,
        lastRunStatus: true,
        lastRunLog: true,
        totalRuns: true,
        totalEvaluated: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, task });
  } catch (err) {
    return handleAuthError(err);
  }
}

// POST — Create or update eval task
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);
    const body = await req.json();
    const { smuAccount, smuPassword, enabled } = body;

    if (!smuAccount) {
      return NextResponse.json(
        { ok: false, error: { message: "学号不能为空" } },
        { status: 400 }
      );
    }

    // For new tasks, password is required
    const existing = await prisma.evalTask.findUnique({
      where: { userId: ctx.userId },
    });

    if (!existing && !smuPassword) {
      return NextResponse.json(
        { ok: false, error: { message: "密码不能为空" } },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      smuAccount,
      enabled: enabled !== false,
    };

    // Only update password if a real new password is provided
    if (smuPassword && smuPassword !== "UNCHANGED") {
      updateData.smuPasswordEnc = encryptKey(smuPassword);
    }

    const task = await prisma.evalTask.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        smuAccount,
        smuPasswordEnc: smuPassword ? encryptKey(smuPassword) : "",
        enabled: enabled !== false,
      },
      update: updateData,
      select: {
        id: true,
        smuAccount: true,
        enabled: true,
        lastRunAt: true,
        lastRunStatus: true,
        totalRuns: true,
        totalEvaluated: true,
      },
    });

    return NextResponse.json({ ok: true, task });
  } catch (err) {
    return handleAuthError(err);
  }
}

// DELETE — Delete eval task
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    await prisma.evalTask.deleteMany({
      where: { userId: ctx.userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
