export interface GrokRefreshTaskSnapshot {
  taskId: string;
  status: string;
  total: number;
  processed: number;
  ok: number;
  fail: number;
  warning: string | null;
  error: string | null;
}

export function extractGrokAdminTokens(raw: string): string[] {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const tokens: string[] = [];

  for (const value of Object.values(parsed)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const token = typeof (item as { token?: unknown }).token === "string" ? (item as { token: string }).token.trim() : "";
      if (token) tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

export function parseGrokRefreshSnapshot(raw: string): GrokRefreshTaskSnapshot | null {
  const blocks = raw.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (!dataLines.length) continue;

    const payload = JSON.parse(dataLines.join("\n")) as {
      task_id?: string;
      status?: string;
      total?: number;
      processed?: number;
      ok?: number;
      fail?: number;
      warning?: string | null;
      error?: string | null;
    };

    return {
      taskId: payload.task_id ?? "",
      status: payload.status ?? "running",
      total: Number(payload.total ?? 0),
      processed: Number(payload.processed ?? 0),
      ok: Number(payload.ok ?? 0),
      fail: Number(payload.fail ?? 0),
      warning: payload.warning ?? null,
      error: payload.error ?? null,
    };
  }

  return null;
}
