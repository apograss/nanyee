export function getProgressPercent(processed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const raw = Math.round((Math.max(0, processed) / total) * 100);
  return Math.max(0, Math.min(100, raw));
}

export function getProgressVariant(input: {
  loading: boolean;
  refreshStatus: string;
}): "idle" | "loading" | "refresh" {
  if (input.refreshStatus === "running") return "refresh";
  if (input.loading) return "loading";
  return "idle";
}
