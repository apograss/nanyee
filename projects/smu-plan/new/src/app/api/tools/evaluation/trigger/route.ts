import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { decryptKey } from "@/lib/keys/selector";
import { runEvaluation } from "@/lib/eval-engine";

// POST — Manually trigger evaluation for current user
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req);

    const task = await prisma.evalTask.findUnique({
      where: { userId: ctx.userId },
    });

    if (!task) {
      return NextResponse.json(
        { ok: false, error: { message: "请先设置教务账号" } },
        { status: 400 }
      );
    }

    // Update status to running
    await prisma.evalTask.update({
      where: { id: task.id },
      data: { lastRunStatus: "running", lastRunAt: new Date() },
    });

    // Decrypt password and run
    const password = decryptKey(task.smuPasswordEnc);
    const result = await runEvaluation(task.smuAccount, password);

    // Update task with results
    await prisma.evalTask.update({
      where: { id: task.id },
      data: {
        lastRunStatus: result.success ? "success" : "failed",
        lastRunLog: JSON.stringify(result.logs.slice(-50)), // Keep last 50 entries
        lastRunAt: new Date(),
        totalRuns: { increment: 1 },
        totalEvaluated: { increment: result.evaluated },
      },
    });

    return NextResponse.json({
      ok: true,
      result: {
        success: result.success,
        evaluated: result.evaluated,
        logs: result.logs,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
