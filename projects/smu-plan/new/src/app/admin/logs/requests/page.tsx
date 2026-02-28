"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface LogItem {
  id: string;
  apiTokenId: string;
  channelId: string | null;
  endpoint: string | null;
  toolName: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  success: boolean;
  errorCode: string | null;
  responseMs: number | null;
  clientIp: string | null;
  requestId: string | null;
  createdAt: string;
  tokenName: string;
  tokenPrefix: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function RequestLogsPage() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [model, setModel] = useState("");
  const [success, setSuccess] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "50" });
      if (model) params.set("model", model);
      if (success) params.set("success", success);
      const res = await fetch(`/api/admin/logs/requests?${params}`);
      const data = await res.json();
      if (data.ok) {
        setItems(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, [page, model, success]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>请求日志</h1>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.filterInput}
          placeholder="模型名称"
          value={model}
          onChange={(e) => { setModel(e.target.value); setPage(1); }}
          aria-label="按模型筛选"
        />
        <select
          className={styles.filterSelect}
          value={success}
          onChange={(e) => { setSuccess(e.target.value); setPage(1); }}
          aria-label="按状态筛选"
        >
          <option value="">全部状态</option>
          <option value="true">成功</option>
          <option value="false">失败</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无日志</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>时间</th>
                <th>Token</th>
                <th>模型</th>
                <th>端点</th>
                <th>Tokens</th>
                <th>费用</th>
                <th>耗时</th>
                <th>状态</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={styles.mono}>{formatDate(item.createdAt)}</td>
                  <td className={styles.truncate} title={item.tokenName}>
                    {item.tokenPrefix && <span className={styles.muted}>{item.tokenPrefix}... </span>}
                    {item.tokenName}
                  </td>
                  <td>{item.model || "-"}</td>
                  <td className={styles.truncate} title={item.endpoint || ""}>{item.endpoint || "-"}</td>
                  <td className={styles.mono}>
                    {item.promptTokens != null ? `${item.promptTokens}/${item.completionTokens ?? 0}` : "-"}
                  </td>
                  <td className={styles.mono}>{item.costUsd != null ? `$${item.costUsd.toFixed(4)}` : "-"}</td>
                  <td className={styles.mono}>{item.responseMs != null ? `${item.responseMs}ms` : "-"}</td>
                  <td>
                    {item.success ? (
                      <span className={styles.success}>OK</span>
                    ) : (
                      <span className={styles.fail}>{item.errorCode || "ERR"}</span>
                    )}
                  </td>
                  <td className={`${styles.mono} ${styles.muted}`}>{item.clientIp || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <NeoButton size="sm" variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                上一页
              </NeoButton>
              <span className={styles.pageInfo}>
                {pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）
              </span>
              <NeoButton size="sm" variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages}>
                下一页
              </NeoButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
