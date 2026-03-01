"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

const DEFAULT_CONFIG = JSON.stringify([
  { icon: "calendar", title: "课表导出", desc: "一键导出教务课表到 WakeUp / ICS", href: "/tools/schedule", enabled: true },
  { icon: "bar-chart", title: "成绩查询", desc: "GPA 计算 + 专业排名 + 趋势分析", href: "/tools/grades", enabled: true },
  { icon: "zap", title: "自动选课", desc: "时间校准 + 毫秒级抢课", href: "/tools/enroll", enabled: true },
], null, 2);

export default function AdminToolsPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (data.ok) {
          const settings = data.data.settings as Record<string, string>;
          if (settings.toolsConfig) setConfig(settings.toolsConfig);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    // Validate JSON
    try {
      JSON.parse(config);
    } catch {
      setMessage("JSON 格式无效");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolsConfig: config }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("保存成功");
      } else {
        setMessage(data.error?.message || "保存失败");
      }
    } catch {
      setMessage("网络错误");
    }
    setSaving(false);
  };

  if (loading) return <div className={styles.page}><div className={styles.empty}>加载中...</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工具配置</h1>
        <NeoButton variant="primary" onClick={handleSave} isLoading={saving}>保存</NeoButton>
      </div>

      <p className={styles.hint}>
        编辑首页工具展示配置（JSON 格式）。每个工具包含 icon, title, desc, href, enabled 字段。
      </p>

      <textarea
        className={styles.editor}
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        spellCheck={false}
        aria-label="工具配置 JSON"
      />

      {message && <div className={styles.message}>{message}</div>}
    </div>
  );
}
