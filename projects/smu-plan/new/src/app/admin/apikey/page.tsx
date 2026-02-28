"use client";

import { useEffect, useState } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import Badge from "@/components/atoms/Badge";
import styles from "../audit/page.module.css";

interface ProviderKeyItem {
  id: string;
  provider: string;
  keyPrefix: string;
  status: string;
  weight: number;
  dailyLimit: number | null;
  usageToday: number;
  lastCheckAt: string | null;
}

interface ApiTokenItem {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  issuedTo: string | null;
  allowedModels: string[] | null;
  lastUsedAt: string | null;
  usageThisMonth: number;
}

export default function ApiKeyPage() {
  const [providerKeys, setProviderKeys] = useState<ProviderKeyItem[]>([]);
  const [apiTokens, setApiTokens] = useState<ApiTokenItem[]>([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenIssuedTo, setNewTokenIssuedTo] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [keysRes, tokensRes] = await Promise.all([
      fetch("/api/admin/keys").then((r) => r.json()),
      fetch("/api/admin/tokens").then((r) => r.json()),
    ]);
    if (keysRes.ok) setProviderKeys(keysRes.data.keys);
    if (tokensRes.ok) setApiTokens(tokensRes.data.tokens);
  };

  useEffect(() => {
    loadData();
  }, []);

  const createToken = async () => {
    if (!newTokenName) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTokenName,
          issuedTo: newTokenIssuedTo || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setCreatedToken(data.data.token);
        setNewTokenName("");
        setNewTokenIssuedTo("");
        loadData();
      }
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async (id: string) => {
    await fetch(`/api/admin/tokens/${id}`, { method: "DELETE" });
    loadData();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "success" as const;
      case "degraded": return "warning" as const;
      default: return "error" as const;
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>API Key 管理</h1>
      </div>

      {/* Provider Keys */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>上游 Provider Keys</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>前缀</th>
              <th>状态</th>
              <th>权重</th>
              <th>今日用量</th>
              <th>日限额</th>
              <th>最后检查</th>
            </tr>
          </thead>
          <tbody>
            {providerKeys.map((key) => (
              <tr key={key.id}>
                <td className={styles.mono}>{key.keyPrefix}***</td>
                <td><Badge text={key.status} colorVariant={statusColor(key.status)} /></td>
                <td>{key.weight}</td>
                <td>{key.usageToday}</td>
                <td>{key.dailyLimit ?? "∞"}</td>
                <td>{key.lastCheckAt ? new Date(key.lastCheckAt).toLocaleString("zh-CN") : "—"}</td>
              </tr>
            ))}
            {providerKeys.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  暂无上游 Key
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Token */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>发放 API Token</h2>

        <div className={styles.form}>
          <div className={styles.formRow}>
            <NeoInput
              label="Token 名称"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="如: 测试用户"
            />
            <NeoInput
              label="发放对象（可选）"
              value={newTokenIssuedTo}
              onChange={(e) => setNewTokenIssuedTo(e.target.value)}
              placeholder="如: 张三"
            />
          </div>
          <NeoButton onClick={createToken} isLoading={loading} disabled={!newTokenName}>
            生成 Token
          </NeoButton>

          {createdToken && (
            <div style={{
              padding: "var(--space-md)",
              background: "var(--color-success-light)",
              border: "1px solid var(--color-success)",
              borderRadius: "var(--neo-radius)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              wordBreak: "break-all",
            }}>
              <strong>新 Token（仅显示一次）：</strong><br />
              {createdToken}
            </div>
          )}
        </div>
      </div>

      {/* Token List */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>已发放 Token</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>名称</th>
              <th>前缀</th>
              <th>状态</th>
              <th>发放给</th>
              <th>本月用量</th>
              <th>最后使用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {apiTokens.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className={styles.mono}>{t.tokenPrefix}***</td>
                <td><Badge text={t.status} colorVariant={statusColor(t.status)} /></td>
                <td>{t.issuedTo || "—"}</td>
                <td>{t.usageThisMonth}</td>
                <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString("zh-CN") : "—"}</td>
                <td>
                  {t.status === "active" && (
                    <NeoButton size="sm" variant="danger" onClick={() => revokeToken(t.id)}>
                      撤销
                    </NeoButton>
                  )}
                </td>
              </tr>
            ))}
            {apiTokens.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  暂无 Token
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
