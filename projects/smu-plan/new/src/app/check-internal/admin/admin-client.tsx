"use client";

import { useEffect, useRef, useState } from "react";

import { getProgressPercent, getProgressVariant } from "./progress";
import styles from "./page.module.css";

export interface AdminOverviewPayload {
  checkedAt: string;
  services: Array<{
    provider: string;
    service: string;
    status: string;
    latencyMs: number | null;
    version: string | null;
    lastError: string | null;
    checkedAt: string;
  }>;
  providers: Array<{
    provider: string;
    capturedAt: string;
    totalAccounts: number;
    healthyAccounts: number;
    rateLimitedAccounts: number;
    invalidAccounts: number;
    staleAccounts: number;
    unknownAccounts: number;
    requests1h: number;
    requests24h: number;
    successRate1h: number;
    successRate24h: number;
  }>;
  incidents: Array<{
    id: string;
    provider: string;
    scope: string;
    severity: string;
    title: string;
    message: string;
    service: string | null;
    occurredAt: string;
  }>;
  latestAccounts: Array<{
    id: string;
    provider: string;
    displayLabel: string;
    status: string;
    lastObservedAt: string | null;
    lastError: string | null;
    requestCount24h: number;
    successRate24h: number;
  }>;
  links: {
    grokAdminUrl: string | null;
    newApiAdminUrl: string | null;
    mainAdminUrl: string | null;
  };
}

export interface AdminAccountItem {
  id: string;
  provider: string;
  displayLabel: string;
  status: string;
  lastUsedAt: string | null;
  lastSuccessAt: string | null;
  lastObservedAt: string | null;
  lastError: string | null;
  requestCount24h: number;
  successRate24h: number;
  updatedAt: string;
}

interface CheckAdminClientProps {
  initialOverview: AdminOverviewPayload;
  initialAccounts: AdminAccountItem[];
}

export default function CheckAdminClient({
  initialOverview,
  initialAccounts,
}: CheckAdminClientProps) {
  const [overview, setOverview] = useState<AdminOverviewPayload>(initialOverview);
  const [accounts, setAccounts] = useState<AdminAccountItem[]>(initialAccounts);
  const [incidents, setIncidents] = useState(initialOverview.incidents);
  const [provider, setProvider] = useState("qwen");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [refreshTaskId, setRefreshTaskId] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<{
    status: string;
    total: number;
    processed: number;
    ok: number;
    fail: number;
    message: string | null;
  }>({
    status: "idle",
    total: 0,
    processed: 0,
    ok: 0,
    fail: 0,
    message: null,
  });
  const didHydrate = useRef(false);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    void loadAccounts(provider, status);
  }, [provider, status]);

  useEffect(() => {
    if (!refreshTaskId) return;

    const timer = window.setInterval(() => {
      void pollGrokRefreshTask(refreshTaskId);
    }, 2500);

    void pollGrokRefreshTask(refreshTaskId);

    return () => window.clearInterval(timer);
  }, [refreshTaskId, provider, status]);

  async function loadOverview() {
    setLoading(true);
    try {
      const overviewRes = await fetch("/api/admin/ai-monitor/overview", { cache: "no-store" });
      const overviewJson = await overviewRes.json();
      if (overviewJson.ok) {
        setOverview(overviewJson.data);
        setIncidents(overviewJson.data.incidents);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts(nextProvider: string, nextStatus: string) {
    setAccountsLoading(true);
    const params = new URLSearchParams({ provider: nextProvider });
    if (nextStatus) params.set("status", nextStatus);
    try {
      const response = await fetch(`/api/admin/ai-monitor/accounts?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (json.ok) {
        setAccounts(json.data.items);
      }
    } finally {
      setAccountsLoading(false);
    }
  }

  async function startGrokRefresh() {
    setRefreshStatus({
      status: "running",
      total: 0,
      processed: 0,
      ok: 0,
      fail: 0,
      message: "正在刷新检测快照…",
    });
    setRefreshTaskId(null);
    await Promise.all([loadOverview(), loadAccounts(provider, status)]);
    setRefreshStatus({
      status: "done",
      total: 0,
      processed: 0,
      ok: 0,
      fail: 0,
      message: "检测快照已刷新。",
    });
  }

  async function pollGrokRefreshTask(taskId: string) {
    const response = await fetch(`/api/admin/ai-monitor/grok-refresh?taskId=${encodeURIComponent(taskId)}`, {
      cache: "no-store",
    });
    const json = await response.json();

    if (!response.ok || !json.ok) {
      setRefreshTaskId(null);
      setRefreshStatus((current) => ({
        ...current,
        status: "error",
        message: json?.error?.message || "读取 Grok 刷新进度失败",
      }));
      return;
    }

    const task = json.data.task as {
      status: string;
      total: number;
      processed: number;
      ok: number;
      fail: number;
      warning: string | null;
      error: string | null;
    };

    const nextMessage =
      task.status === "done"
        ? `Grok 状态刷新完成，成功 ${task.ok}，失败 ${task.fail}。`
        : task.status === "error"
          ? task.error || "Grok 状态刷新失败"
          : task.status === "cancelled"
            ? "Grok 状态刷新已取消。"
            : `Grok 状态刷新进行中：${task.processed}/${task.total}`;

    setRefreshStatus({
      status: task.status,
      total: task.total,
      processed: task.processed,
      ok: task.ok,
      fail: task.fail,
      message: task.warning ? `${nextMessage} ${task.warning}` : nextMessage,
    });

    if (task.status === "done" || task.status === "error" || task.status === "cancelled") {
      setRefreshTaskId(null);
      await Promise.all([loadOverview(), loadAccounts(provider, status)]);
    }
  }

  const progressVariant = getProgressVariant({
    loading: loading || accountsLoading,
    refreshStatus: refreshStatus.status,
  });
  const progressPercent = getProgressPercent(refreshStatus.processed, refreshStatus.total);
  const showProgressBar = progressVariant !== "idle";

  return (
    <div className={styles.page}>
      {showProgressBar ? (
        <div className={styles.progressShell} aria-live="polite">
          <div
            className={`${styles.progressBar} ${
              progressVariant === "refresh" ? styles.progressBarRefresh : styles.progressBarLoading
            }`}
            style={progressVariant === "refresh" ? { width: `${progressPercent}%` } : undefined}
          />
        </div>
      ) : null}

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>统一 AI 监控</h2>
          <p className={styles.subtitle}>只读监控台，用于查看 Qwen 和 LongCat 的服务、账号与异常。</p>
          <p className={styles.refreshMeta}>上次刷新：{formatTimestamp(overview.checkedAt)}</p>
        </div>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => void startGrokRefresh()}
            disabled={refreshStatus.status === "running"}
          >
            {refreshStatus.status === "running"
              ? `刷新检测快照 ${refreshStatus.processed}/${refreshStatus.total || "-"}`
              : "刷新检测快照"}
          </button>
          {overview.links.newApiAdminUrl ? (
            <a href={overview.links.newApiAdminUrl} className={styles.linkButton} target="_blank" rel="noreferrer">
              打开 New API
            </a>
          ) : null}
          {overview.links.mainAdminUrl ? (
            <a href={overview.links.mainAdminUrl} className={styles.linkButton}>
              主站后台
            </a>
          ) : null}
        </div>
        {refreshStatus.message ? (
          <p className={refreshStatus.status === "error" ? styles.refreshError : styles.refreshMeta}>
            {refreshStatus.message}
            {refreshStatus.status === "running" ? ` ${progressPercent}%` : ""}
          </p>
        ) : null}
      </div>

      {loading || accountsLoading ? (
        <div className={styles.empty}>
          {progressVariant === "refresh" ? "正在刷新检测快照…" : "正在加载上一次快照…"}
        </div>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>服务商概览</h3>
        <div className={styles.grid}>
          {overview.providers.map((item) => (
            <article key={item.provider} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>{getProviderLabel(item.provider)}</strong>
                <span className={`${styles.badge} ${styles[`badge${normalizeStatus(item.invalidAccounts > 0 ? "invalid" : item.healthyAccounts > 0 ? "healthy" : "unknown")}`]}`}>
                  {item.invalidAccounts > 0 ? "需关注" : item.healthyAccounts > 0 ? "正常" : "待确认"}
                </span>
              </div>
              <p className={styles.metric}>{item.healthyAccounts}/{item.totalAccounts}</p>
              <div className={styles.kv}>
                <span>1 小时请求</span>
                <span>{item.requests1h}</span>
                <span>24 小时请求</span>
                <span>{item.requests24h}</span>
                <span>24 小时成功率</span>
                <span>{item.successRate24h}%</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>服务状态</h3>
        <div className={styles.grid}>
          {overview.services.map((item) => (
            <article key={item.service} className={styles.card}>
              <div className={styles.cardHeader}>
                <strong>{getServiceLabel(item.service)}</strong>
                <span className={`${styles.badge} ${styles[`badge${normalizeStatus(item.status)}`]}`}>{getStatusLabel(item.status)}</span>
              </div>
              <div className={styles.kv}>
                <span>服务商</span>
                <span>{getProviderLabel(item.provider)}</span>
                <span>延迟</span>
                <span>{item.latencyMs ?? "-"} ms</span>
                <span>版本</span>
                <span>{item.version ?? "-"}</span>
              </div>
              {item.lastError ? <p className={styles.errorText}>{item.lastError}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.filterBar}>
          <h3 className={styles.sectionTitle}>账号状态</h3>
          <div className={styles.filters}>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className={styles.select}>
              <option value="qwen">Qwen</option>
              <option value="longcat">LongCat</option>
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={styles.select}>
              <option value="">全部状态</option>
              <option value="healthy">正常</option>
              <option value="rate_limited">限流</option>
              <option value="invalid">失效</option>
              <option value="stale">陈旧</option>
              <option value="unknown">待确认</option>
            </select>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>账号</th>
                <th>状态</th>
                <th>最近观测</th>
                <th>24 小时请求</th>
                <th>24 小时成功率</th>
                <th>最近错误</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((item) => (
                <tr key={item.id}>
                  <td>{item.displayLabel}</td>
                  <td>{getStatusLabel(item.status)}</td>
                  <td>{item.lastObservedAt ? formatTimestamp(item.lastObservedAt) : "-"}</td>
                  <td>{item.requestCount24h}</td>
                  <td>{item.successRate24h}%</td>
                  <td className={styles.errorCell}>{item.lastError || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>事故明细</h3>
        <div className={styles.incidentList}>
          {incidents.length ? (
            incidents.map((incident) => (
              <article key={incident.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <strong>{incident.title}</strong>
                  <span className={`${styles.badge} ${styles[`badge${normalizeStatus(incident.severity === "high" ? "invalid" : "degraded")}`]}`}>
                    {getSeverityLabel(incident.severity)}
                  </span>
                </div>
                <p className={styles.meta}>
                  {getProviderLabel(incident.provider)} · {getScopeLabel(incident.scope)} · {formatTimestamp(incident.occurredAt)}
                </p>
                <p className={styles.errorText}>{incident.message}</p>
              </article>
            ))
          ) : (
            <div className={styles.empty}>暂时没有事故记录。</div>
          )}
        </div>
      </section>
    </div>
  );
}

function normalizeStatus(status: string) {
  if (status === "healthy") return "Healthy";
  if (status === "degraded" || status === "rate_limited") return "Degraded";
  if (status === "invalid" || status === "unhealthy") return "Invalid";
  return "Unknown";
}

function getProviderLabel(provider: string) {
  return provider === "qwen" ? "Qwen" : provider === "longcat" ? "LongCat" : provider;
}

function getServiceLabel(service: string) {
  if (service === "cpa") return "CPA 代理池";
  if (service === "new_api") return "New API";
  return service;
}

function getStatusLabel(status: string) {
  if (status === "healthy") return "正常";
  if (status === "degraded") return "降级";
  if (status === "rate_limited") return "限流";
  if (status === "invalid") return "失效";
  if (status === "unhealthy") return "异常";
  if (status === "stale") return "陈旧";
  return "待确认";
}

function getSeverityLabel(severity: string) {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  if (severity === "low") return "低";
  return severity;
}

function getScopeLabel(scope: string) {
  if (scope === "service") return "服务";
  if (scope === "account") return "账号";
  return scope;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}
