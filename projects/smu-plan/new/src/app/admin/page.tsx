"use client";

import { useEffect, useState } from "react";

import { ADMIN_DASHBOARD_CARDS, type AdminDashboardStats } from "./config";
import styles from "./page.module.css";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStats(data.data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className={styles.title}>管理后台</h1>

      <div className={styles.grid}>
        {ADMIN_DASHBOARD_CARDS.map((card) => (
          <div key={card.key} className={styles.card}>
            <p className={styles.cardLabel}>{card.label}</p>
            <p className={styles.cardValue}>{stats?.[card.key] ?? "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
