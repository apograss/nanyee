"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildPublicOverviewMetrics } from "./public-view";
import styles from "./page.module.css";

interface ServiceRecord {
  provider: string;
  service: string;
  status: string;
  latencyMs: number | null;
  version: string | null;
  lastError: string | null;
  checkedAt: string;
}

interface ProviderSnapshot {
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
}

interface IncidentRecord {
  id: string;
  provider: string;
  scope: string;
  severity: string;
  title: string;
  message: string;
  service: string | null;
  occurredAt: string;
}

interface HistoryPoint {
  provider: string;
  date: string;
  healthyAccounts: number;
  requests24h: number;
  successRate24h: number;
  invalidAccounts: number;
  rateLimitedAccounts: number;
}

interface PublicCheckClientProps {
  initialSummary: {
    checkedAt: string;
    services: ServiceRecord[];
    providers: ProviderSnapshot[];
    incidents: IncidentRecord[];
  };
  initialHistory: HistoryPoint[];
}

export default function PublicCheckClient({
  initialSummary,
  initialHistory,
}: PublicCheckClientProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const overview = useMemo(
    () => buildPublicOverviewMetrics(initialSummary.providers),
    [initialSummary.providers]
  );

  const chartData = useMemo(() => {
    const grouped = new Map<
      string,
      {
        date: string;
        qwenRequests24h: number;
        longcatRequests24h: number;
        qwenHealthyAccounts: number;
        longcatHealthyAccounts: number;
      }
    >();

    for (const item of initialHistory) {
      const entry =
        grouped.get(item.date) || {
          date: item.date,
          qwenRequests24h: 0,
          longcatRequests24h: 0,
          qwenHealthyAccounts: 0,
          longcatHealthyAccounts: 0,
        };

      if (item.provider === "qwen") {
        entry.qwenRequests24h = item.requests24h;
        entry.qwenHealthyAccounts = item.healthyAccounts;
      } else {
        entry.longcatRequests24h = item.requests24h;
        entry.longcatHealthyAccounts = item.healthyAccounts;
      }

      grouped.set(item.date, entry);
    }

    return [...grouped.values()];
  }, [initialHistory]);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBackdrop} />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Public Status</p>
          <h2 className={styles.heroTitle}>综合概览</h2>
          <p className={styles.heroText}>
            展示 Qwen 与 LongCat 最近一次定时采集结果。页面优先秒开，后台再按节奏刷新账号池状态。
          </p>
          <div className={styles.heroMetaRow}>
            <span className={styles.heroPill}>上次刷新：{formatTimestamp(initialSummary.checkedAt)}</span>
            <span className={styles.heroPillMuted}>快照模式，不在访问时实时扫号</span>
          </div>
        </div>

        <div className={styles.heroStats}>
          <MetricCard label="健康覆盖率" value={`${overview.healthPercent}%`} note={`${overview.healthyAccounts}/${overview.totalAccounts} 账号可用`} />
          <MetricCard label="24 小时请求" value={formatNumber(overview.totalRequests24h)} note="合并 Qwen 与 LongCat 请求量" />
          <MetricCard label="平均成功率" value={`${overview.averageSuccessRate24h}%`} note="按服务商快照平均计算" />
          <MetricCard label="待处理告警" value={formatNumber(overview.attentionAccounts)} note={`${overview.invalidAccounts} 失效 / ${overview.rateLimitedAccounts} 限流`} tone="warning" />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Providers</p>
            <h3 className={styles.sectionTitle}>服务商态势</h3>
          </div>
          <p className={styles.sectionHint}>先看整体可用比例，再看失效和限流分布。</p>
        </div>

        <div className={styles.providerGrid}>
          {initialSummary.providers.map((provider) => {
            const healthyPercent = provider.totalAccounts
              ? Math.round((provider.healthyAccounts / provider.totalAccounts) * 100)
              : 0;
            const unknownPercent = provider.totalAccounts
              ? Math.round((provider.unknownAccounts / provider.totalAccounts) * 100)
              : 0;
            const invalidPercent = provider.totalAccounts
              ? Math.round((provider.invalidAccounts / provider.totalAccounts) * 100)
              : 0;
            const rateLimitedPercent = provider.totalAccounts
              ? Math.round((provider.rateLimitedAccounts / provider.totalAccounts) * 100)
              : 0;

            return (
              <article
                key={provider.provider}
                className={`${styles.providerCard} ${
                  provider.provider === "qwen" ? styles.providerCardChatgpt : styles.providerCardGrok
                }`}
              >
                <div className={styles.providerHeader}>
                  <div>
                    <p className={styles.providerLabel}>{getProviderLabel(provider.provider)}</p>
                    <h4 className={styles.providerValue}>
                      {formatNumber(provider.healthyAccounts)}
                      <span className={styles.providerValueMuted}> / {formatNumber(provider.totalAccounts)}</span>
                    </h4>
                  </div>
                  <span
                    className={`${styles.badge} ${
                      styles[`badge${normalizeStatus(provider.invalidAccounts > 0 ? "invalid" : provider.healthyAccounts > 0 ? "healthy" : "unknown")}`]
                    }`}
                  >
                    {provider.invalidAccounts > 0 ? "需关注" : provider.healthyAccounts > 0 ? "运行正常" : "待确认"}
                  </span>
                </div>

                <div className={styles.coverageBar} aria-hidden="true">
                  <span className={styles.coverageHealthy} style={{ width: `${healthyPercent}%` }} />
                  <span className={styles.coverageUnknown} style={{ width: `${unknownPercent}%` }} />
                  <span className={styles.coverageWarning} style={{ width: `${rateLimitedPercent}%` }} />
                  <span className={styles.coverageInvalid} style={{ width: `${invalidPercent}%` }} />
                </div>

                <div className={styles.providerStats}>
                  <span>覆盖率 {healthyPercent}%</span>
                  <span>24h 请求 {formatNumber(provider.requests24h)}</span>
                  <span>成功率 {provider.successRate24h}%</span>
                  <span>待确认 {formatNumber(provider.unknownAccounts)}</span>
                </div>

                <div className={styles.providerFooter}>
                  <span>{formatNumber(provider.invalidAccounts)} 失效</span>
                  <span>{formatNumber(provider.rateLimitedAccounts)} 限流</span>
                  <span>{formatNumber(provider.staleAccounts)} 陈旧</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Services</p>
            <h3 className={styles.sectionTitle}>服务健康矩阵</h3>
          </div>
          <p className={styles.sectionHint}>看当前链路是否在线、延迟是否异常、错误是否需要人工处理。</p>
        </div>

        <div className={styles.serviceGrid}>
          {initialSummary.services.map((service) => (
            <article key={service.service} className={styles.serviceCard}>
              <div className={styles.serviceTop}>
                <div>
                  <p className={styles.serviceName}>{getServiceLabel(service.service)}</p>
                  <p className={styles.serviceProvider}>{getProviderLabel(service.provider)}</p>
                </div>
                <span className={`${styles.badge} ${styles[`badge${normalizeStatus(service.status)}`]}`}>
                  {getStatusLabel(service.status)}
                </span>
              </div>

              <div className={styles.serviceMetrics}>
                <div>
                  <span className={styles.metricLabel}>延迟</span>
                  <strong>{service.latencyMs ?? "-"} ms</strong>
                </div>
                <div>
                  <span className={styles.metricLabel}>版本</span>
                  <strong>{service.version ?? "-"}</strong>
                </div>
                <div>
                  <span className={styles.metricLabel}>观测时间</span>
                  <strong>{formatTimestamp(service.checkedAt)}</strong>
                </div>
              </div>

              {service.lastError ? <p className={styles.errorText}>{service.lastError}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Trend</p>
            <h3 className={styles.sectionTitle}>7 天趋势</h3>
          </div>
          <p className={styles.sectionHint}>左图看日请求量，右图看健康账号变化。</p>
        </div>

        <div className={styles.chartGrid}>
          <article className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h4>请求量节奏</h4>
              <p>最近 7 天每 24 小时请求汇总</p>
            </div>
            {mounted ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="chatgptArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8652b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#e8652b" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="grokArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d3557" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1d3557" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(29,53,87,0.18)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip />
                  <Area type="monotone" dataKey="qwenRequests24h" stroke="#e8652b" fill="url(#chatgptArea)" name="Qwen 请求量" />
                  <Area type="monotone" dataKey="longcatRequests24h" stroke="#1d3557" fill="url(#grokArea)" name="LongCat 请求量" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </article>

          <article className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h4>健康账号走势</h4>
              <p>观察两条账号池的有效覆盖面</p>
            </div>
            {mounted ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="chatgptHealthyArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2a9d8f" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#2a9d8f" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="grokHealthyArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#457b9d" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#457b9d" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(29,53,87,0.18)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip />
                  <Area type="monotone" dataKey="qwenHealthyAccounts" stroke="#2a9d8f" fill="url(#chatgptHealthyArea)" name="Qwen 健康账号" />
                  <Area type="monotone" dataKey="longcatHealthyAccounts" stroke="#457b9d" fill="url(#grokHealthyArea)" name="LongCat 健康账号" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Incidents</p>
            <h3 className={styles.sectionTitle}>最近事故时间线</h3>
          </div>
          <p className={styles.sectionHint}>只展示最近快照里的服务级和账号级异常摘要。</p>
        </div>

        <div className={styles.incidentList}>
          {initialSummary.incidents.length ? (
            initialSummary.incidents.map((incident) => (
              <article key={incident.id} className={styles.incident}>
                <div className={styles.incidentMarker} />
                <div className={styles.incidentBody}>
                  <div className={styles.cardHeader}>
                    <strong>{incident.title}</strong>
                    <span className={`${styles.badge} ${styles[`badge${normalizeStatus(incident.severity === "high" ? "invalid" : "degraded")}`]}`}>
                      {getSeverityLabel(incident.severity)}
                    </span>
                  </div>
                  <p className={styles.incidentMeta}>
                    {getProviderLabel(incident.provider)} · {getScopeLabel(incident.scope)} · {formatTimestamp(incident.occurredAt)}
                  </p>
                  <p className={styles.errorText}>{incident.message}</p>
                </div>
              </article>
            ))
          ) : (
            <div className={styles.emptyState}>
              <strong>最近没有新的事故。</strong>
              <p>当前展示的是最近一次采集结果，服务链路与账号池没有产生新的高优先级异常。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className={styles.chartPlaceholder} aria-hidden="true">
      <div className={`${styles.loadingLine} ${styles.loadingLineWide}`} />
      <div className={styles.chartPlaceholderBody}>
        <div className={`${styles.loadingLine} ${styles.loadingLineTall}`} />
        <div className={`${styles.loadingLine} ${styles.loadingLineTall}`} />
        <div className={`${styles.loadingLine} ${styles.loadingLineTall}`} />
      </div>
      <div className={styles.chartPlaceholderAxis}>
        <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
        <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
        <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
      </div>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warning";
}) {
  return (
    <article
      className={`${styles.metricCard} ${
        props.tone === "warning" ? styles.metricCardWarning : ""
      }`}
    >
      <p className={styles.metricLabel}>{props.label}</p>
      <strong className={styles.metricValue}>{props.value}</strong>
      <p className={styles.metricNote}>{props.note}</p>
    </article>
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
  if (service === "cpa") return "CPA Qwen 池";
  if (service === "new_api") return "LongCat / New API";
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
