"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

interface DashboardStats {
  totalUsers: number;
  totalArticles: number;
  totalSearches: number;
  totalToolRuns: number;
  activeKeys: number;
  activeTokens: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setStats(data.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className={styles.title}>管理后台</h1>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>用户总数</p>
          <p className={styles.cardValue}>{stats?.totalUsers ?? "—"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>文章数</p>
          <p className={styles.cardValue}>{stats?.totalArticles ?? "—"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>AI 搜索次数</p>
          <p className={styles.cardValue}>{stats?.totalSearches ?? "—"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>工具调用</p>
          <p className={styles.cardValue}>{stats?.totalToolRuns ?? "—"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>活跃 Key</p>
          <p className={styles.cardValue}>{stats?.activeKeys ?? "—"}</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>活跃 Token</p>
          <p className={styles.cardValue}>{stats?.activeTokens ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
