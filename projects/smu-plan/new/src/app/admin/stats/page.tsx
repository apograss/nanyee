"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import styles from "./page.module.css";

interface SeriesPoint {
  date: string;
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  successRate: number;
}

interface Summary {
  today: { requests: number; tokens: number; cost: number };
  month: { requests: number; tokens: number; cost: number };
}

export default function StatsPage() {
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState("day");
  const [days, setDays] = useState("30");

  const loadStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ granularity, days });
      const res = await fetch(`/api/admin/stats/usage?${params}`);
      const data = await res.json();
      if (data.ok) {
        setSeries(data.data.series);
        setSummary(data.data.summary);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [granularity, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>用量统计</h1>
        <div className={styles.controls}>
          <select
            className={styles.select}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="时间范围"
          >
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="90">近 90 天</option>
          </select>
          <select
            className={styles.select}
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            aria-label="统计粒度"
          >
            <option value="day">按天</option>
            <option value="week">按周</option>
            <option value="month">按月</option>
          </select>
        </div>
      </div>

      {summary && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <p className={styles.cardLabel}>今日请求</p>
            <p className={styles.cardValue}>{formatNumber(summary.today.requests)}</p>
            <p className={styles.cardSub}>{formatNumber(summary.today.tokens)} tokens</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>今日费用</p>
            <p className={styles.cardValue}>${summary.today.cost.toFixed(4)}</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>本月请求</p>
            <p className={styles.cardValue}>{formatNumber(summary.month.requests)}</p>
            <p className={styles.cardSub}>{formatNumber(summary.month.tokens)} tokens</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardLabel}>本月费用</p>
            <p className={styles.cardValue}>${summary.month.cost.toFixed(4)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : series.length === 0 ? (
        <div className={styles.empty}>暂无数据</div>
      ) : (
        <>
          <div className={styles.chartSection}>
            <h2 className={styles.chartTitle}>请求量趋势</h2>
            <div className={styles.chartBox} role="img" aria-label="请求量趋势图表">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalRequests" name="请求数" fill="var(--color-brand)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartSection}>
            <h2 className={styles.chartTitle}>Token 用量</h2>
            <div className={styles.chartBox} role="img" aria-label="Token用量趋势图表">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="promptTokens" name="Prompt" stroke="var(--color-brand)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completionTokens" name="Completion" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartSection}>
            <h2 className={styles.chartTitle}>成功率 (%)</h2>
            <div className={styles.chartBox} role="img" aria-label="成功率趋势图表">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="successRate" name="成功率" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
