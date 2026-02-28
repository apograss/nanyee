"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface AuditItem {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  targetType: string | null;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "50" });
      if (action) params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      const res = await fetch(`/api/admin/logs/audit?${params}`);
      const data = await res.json();
      if (data.ok) {
        setItems(data.data.items);
        setPagination(data.data.pagination);
        if (data.data.filters?.actions) setActions(data.data.filters.actions);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, [page, action, targetType]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>审计日志</h1>
      </div>

      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          aria-label="按操作类型筛选"
        >
          <option value="">全部操作</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          className={styles.filterInput}
          placeholder="目标类型"
          value={targetType}
          onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
          aria-label="按目标类型筛选"
        />
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
                <th>操作</th>
                <th>操作者</th>
                <th>目标类型</th>
                <th>目标 ID</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={styles.mono}>{formatDate(item.createdAt)}</td>
                  <td><span className={styles.action}>{item.action}</span></td>
                  <td>{item.actorName}</td>
                  <td>{item.targetType || "-"}</td>
                  <td className={`${styles.mono} ${styles.truncate}`} title={item.targetId || ""}>
                    {item.targetId || "-"}
                  </td>
                  <td>
                    {item.payload ? (
                      <div>
                        <button
                          className={styles.payloadToggle}
                          onClick={() => toggleExpand(item.id)}
                          aria-expanded={expandedIds.has(item.id)}
                        >
                          {expandedIds.has(item.id) ? "收起" : "展开"}
                        </button>
                        {expandedIds.has(item.id) && (
                          <div className={styles.payload}>
                            {JSON.stringify(item.payload, null, 2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className={styles.muted}>-</span>
                    )}
                  </td>
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
