"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  viewCount: number;
  authorName: string;
  tags: string[];
  createdAt: string;
  publishedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_OPTIONS = ["", "draft", "pending", "published", "rejected", "hidden"];
const STATUS_LABELS: Record<string, string> = {
  "": "全部状态",
  draft: "草稿",
  pending: "待审",
  published: "已发布",
  rejected: "已退回",
  hidden: "已隐藏",
};

export default function AdminArticlesPage() {
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Edit modal
  const [editItem, setEditItem] = useState<ArticleItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editTags, setEditTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadArticles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/articles?${params}`);
      const data = await res.json();
      if (data.ok) {
        setItems(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadArticles(); }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadArticles();
  };

  const openEdit = (item: ArticleItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditStatus(item.status);
    setEditTags(item.tags.join(", "));
    setError("");
  };

  const handleSave = async () => {
    if (!editItem) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          status: editStatus,
          tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditItem(null);
        loadArticles();
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch {
      setError("网络错误");
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`确定要隐藏文章 "${title}" 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) loadArticles();
      else alert(data.error?.message || "操作失败");
    } catch {
      alert("网络错误");
    }
  };

  const handleHardDelete = async (id: string, title: string) => {
    const input = window.prompt(
      `⚠️ 危险操作！永久删除不可恢复。\n请输入文章标题 "${title}" 以确认：`
    );
    if (input === null) return;
    if (input !== title) {
      alert("标题输入不匹配，操作已取消。");
      return;
    }
    try {
      const res = await fetch(`/api/admin/articles/${id}?permanent=true`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) loadArticles();
      else alert(data.error?.message || "永久删除失败");
    } catch {
      alert("网络错误");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>文章管理</h1>
      </div>

      <div className={styles.filters}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <NeoInput placeholder="搜索标题..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <NeoButton type="submit" variant="secondary" size="sm">搜索</NeoButton>
        </form>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="按状态筛选"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {editItem && (
        <div className={styles.formOverlay} onClick={() => setEditItem(null)} onKeyDown={(e) => { if (e.key === "Escape") setEditItem(null); }}>
          <div className={styles.form} role="dialog" aria-modal="true" aria-label="编辑文章" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.formTitle}>编辑文章</h2>
            {error && <div className={styles.error}>{error}</div>}
            <NeoInput label="标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <div className={styles.fieldGroup}>
              <label className={styles.label}>状态</label>
              <select className={styles.filterSelect} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                {STATUS_OPTIONS.filter((s) => s).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <NeoInput label="标签 (逗号分隔)" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
            <div className={styles.formActions}>
              <NeoButton variant="primary" onClick={handleSave} isLoading={submitting}>保存</NeoButton>
              <NeoButton variant="secondary" onClick={() => setEditItem(null)}>取消</NeoButton>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无文章</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>作者</th>
                  <th>状态</th>
                  <th>浏览</th>
                  <th>日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.title}</strong></td>
                    <td>{item.authorName}</td>
                    <td><span className={styles.statusBadge} data-status={item.status}>{STATUS_LABELS[item.status] || item.status}</span></td>
                    <td>{item.viewCount}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td className={styles.actions}>
                      <NeoButton size="sm" variant="secondary" onClick={() => openEdit(item)}>编辑</NeoButton>
                      <NeoButton size="sm" variant="danger" onClick={() => handleDelete(item.id, item.title)}>隐藏</NeoButton>
                      <NeoButton size="sm" variant="danger" onClick={() => handleHardDelete(item.id, item.title)}>永久删除</NeoButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <NeoButton size="sm" variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>上一页</NeoButton>
              <span className={styles.pageInfo}>{pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）</span>
              <NeoButton size="sm" variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages}>下一页</NeoButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
