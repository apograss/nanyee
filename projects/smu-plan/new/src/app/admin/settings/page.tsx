"use client";

import { useEffect, useState, useCallback } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "../audit/page.module.css";

interface SiteSettings {
  site_name: string;
  site_description: string;
  homepage_announcement: string;
  default_ai_model: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  site_name: "nanyee.de",
  site_description: "SMU Campus AI Platform",
  homepage_announcement: "",
  default_ai_model: "longcat-flash-chat",
};

const SETTING_LABELS: Record<keyof SiteSettings, string> = {
  site_name: "站点名称",
  site_description: "站点描述",
  homepage_announcement: "首页公告文本",
  default_ai_model: "默认 AI 模型",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.ok) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.data.settings });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveMessage("保存成功");
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setSaveMessage("保存失败: " + (data.error?.message || "Unknown error"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof SiteSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div>
        <h1 className={styles.title}>站点设置</h1>
        <p style={{ color: "var(--text-muted)" }}>加载中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>站点设置</h1>
      </div>

      <div className={styles.section}>
        <div className={styles.form}>
          {(Object.keys(SETTING_LABELS) as (keyof SiteSettings)[]).map((key) => (
            <NeoInput
              key={key}
              label={SETTING_LABELS[key]}
              value={settings[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={DEFAULT_SETTINGS[key] || `输入${SETTING_LABELS[key]}...`}
            />
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <NeoButton onClick={handleSave} isLoading={saving}>
              保存设置
            </NeoButton>
            {saveMessage && (
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  color: saveMessage.startsWith("保存成功")
                    ? "var(--color-success)"
                    : "var(--color-error)",
                  fontWeight: 600,
                }}
              >
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
