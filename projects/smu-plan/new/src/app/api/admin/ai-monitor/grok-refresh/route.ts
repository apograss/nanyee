import { NextRequest } from "next/server";

import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { collectAiMonitoring } from "@/lib/check/collector";
import { getCheckConfig } from "@/lib/check/config";
import { extractGrokAdminTokens, parseGrokRefreshSnapshot } from "@/lib/check/grok-admin";

const SNAPSHOT_READ_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const config = getCheckConfig();
    ensureGrokAdminConfig(config);

    const tokenResponse = await fetch(`${config.grokAdminBaseUrl}/v1/admin/tokens`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.grokAdminApiKey}` },
      cache: "no-store",
    });
    const tokenBody = await tokenResponse.text();

    if (!tokenResponse.ok) {
      return Response.json(
        {
          ok: false,
          error: {
            code: tokenResponse.status,
            message: tokenBody || "读取 Grok Token 列表失败",
          },
        },
        { status: tokenResponse.status }
      );
    }

    const tokens = extractGrokAdminTokens(tokenBody);
    if (!tokens.length) {
      return Response.json(
        {
          ok: false,
          error: {
            code: 400,
            message: "没有可刷新的 Grok Token",
          },
        },
        { status: 400 }
      );
    }

    const refreshResponse = await fetch(`${config.grokAdminBaseUrl}/v1/admin/tokens/refresh/async`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.grokAdminApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tokens }),
      cache: "no-store",
    });
    const refreshJson = (await refreshResponse.json()) as {
      task_id?: string;
      total?: number;
      status?: string;
      detail?: string;
    };

    if (!refreshResponse.ok || refreshJson.status !== "success" || !refreshJson.task_id) {
      return Response.json(
        {
          ok: false,
          error: {
            code: refreshResponse.status || 500,
            message: refreshJson.detail || "启动 Grok 刷新失败",
          },
        },
        { status: refreshResponse.status || 500 }
      );
    }

    return Response.json({
      ok: true,
      data: {
        taskId: refreshJson.task_id,
        total: Number(refreshJson.total ?? tokens.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const config = getCheckConfig();
    ensureGrokAdminConfig(config);

    const taskId = req.nextUrl.searchParams.get("taskId")?.trim();
    if (!taskId) {
      return Response.json(
        {
          ok: false,
          error: {
            code: 400,
            message: "缺少 taskId",
          },
        },
        { status: 400 }
      );
    }

    const task = await readGrokRefreshTaskSnapshot(config, taskId);
    const monitorResult = task.status === "done" ? await collectAiMonitoring() : null;

    return Response.json({
      ok: true,
      data: {
        task,
        monitorResult,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

function ensureGrokAdminConfig(config: ReturnType<typeof getCheckConfig>) {
  if (!config.grokAdminBaseUrl || !config.grokAdminApiKey) {
    throw new Error("缺少 Grok 管理接口配置");
  }
}

async function readGrokRefreshTaskSnapshot(
  config: ReturnType<typeof getCheckConfig>,
  taskId: string
) {
  const controller = new AbortController();
  const response = await fetch(
    `${config.grokAdminBaseUrl}/v1/admin/batch/${encodeURIComponent(taskId)}/stream?app_key=${encodeURIComponent(config.grokAdminApiKey)}`,
    {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: controller.signal,
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `读取 Grok 刷新任务失败 (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Grok 刷新任务没有返回可读流");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + SNAPSHOT_READ_TIMEOUT_MS;

  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const snapshot = parseGrokRefreshSnapshot(buffer);
      if (snapshot) {
        controller.abort();
        return snapshot;
      }
    }
  } finally {
    try {
      controller.abort();
    } catch {
      // noop
    }
  }

  throw new Error("读取 Grok 刷新进度超时");
}
