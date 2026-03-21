import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptKey } from "@/lib/keys/selector";
import { runEvaluation } from "@/lib/eval-engine";

// POST — Cron endpoint, runs all enabled eval tasks
// Auth: CRON_SECRET header
export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const tasks = await prisma.evalTask.findMany({
    where: { enabled: true },
  });

  const results: Array<{
    userId: string;
    account: string;
    success: boolean;
    evaluated: number;
  }> = [];

  for (const task of tasks) {
    try {
      // Update status
      await prisma.evalTask.update({
        where: { id: task.id },
        data: { lastRunStatus: "running", lastRunAt: new Date() },
      });

      const password = decryptKey(task.smuPasswordEnc);
      const result = await runEvaluation(task.smuAccount, password);

      await prisma.evalTask.update({
        where: { id: task.id },
        data: {
          lastRunStatus: result.success ? "success" : "failed",
          lastRunLog: JSON.stringify(result.logs.slice(-50)),
          lastRunAt: new Date(),
          totalRuns: { increment: 1 },
          totalEvaluated: { increment: result.evaluated },
        },
      });

      results.push({
        userId: task.userId,
        account: task.smuAccount,
        success: result.success,
        evaluated: result.evaluated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.evalTask.update({
        where: { id: task.id },
        data: {
          lastRunStatus: "failed",
          lastRunLog: JSON.stringify([
            { time: new Date().toISOString(), level: "error", message: msg },
          ]),
          lastRunAt: new Date(),
          totalRuns: { increment: 1 },
        },
      });
      results.push({
        userId: task.userId,
        account: task.smuAccount,
        success: false,
        evaluated: 0,
      });
    }

    // Delay between users to avoid overloading
    await new Promise((r) => setTimeout(r, 2000));
  }

  return NextResponse.json({
    ok: true,
    processed: tasks.length,
    results,
  });
}
