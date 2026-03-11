"use client";

import { useEffect, useState } from "react";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import ConfirmDialog from "@/components/molecules/ConfirmDialog";

import styles from "./page.module.css";

interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  isLocked: boolean;
  isPinned: boolean;
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

interface NoticeState {
  tone: "success" | "error" | "info";
  message: string;
}

const STATUS_OPTIONS = ["", "published", "hidden"];
const STATUS_LABELS: Record<string, string> = {
  "": "全部状态",
  published: "已发布",
  hidden: "已隐藏",
};

export default function AdminArticlesPage() {
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editItem, setEditItem] = useState<ArticleItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editTags, setEditTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingHide, setPendingHide] = useState<ArticleItem | null>(null);
  const [pendingHardDelete, setPendingHardDelete] = useState<ArticleItem | null>(null);
  const [hardDeleteInput, setHardDeleteInput] = useState("");

  async function loadArticles() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) {
        params.set("search", search);
      }
      if (statusFilter) {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/admin/articles?${params}`);
      const data = await res.json();
      if (data.ok) {
        setItems(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch {
      setItems([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArticles();
  }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadArticles();
  }

  function openEdit(item: ArticleItem) {
    setEditItem(item);
    setEditTitle(item.title);
    setEditStatus(item.status);
    setEditTags(item.tags.join(", "));
    setError("");
  }

  function showNotice(tone: NoticeState["tone"], message: string) {
    setNotice({ tone, message });
  }

  async function handleSave() {
    if (!editItem) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          status: editStatus,
          tags: editTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditItem(null);
        loadArticles();
        showNotice("success", "文章设置已保存。");
      } else {
        setError(data.error?.message || "保存失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleLock(item: ArticleItem) {
    try {
      const res = await fetch(`/api/admin/articles/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !item.isLocked }),
      });
      const data = await res.json();
      if (data.ok) {
        loadArticles();
        showNotice("success", item.isLocked ? "文章已解锁。" : "文章已锁定。");
      } else {
        showNotice("error", data.error?.message || "切换锁定状态失败");
      }
    } catch {
      showNotice("error", "网络错误，请稍后重试。");
    }
  }

  async function handleTogglePin(item: ArticleItem) {
    try {
      const res = await fetch(`/api/admin/articles/${item.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !item.isPinned }),
      });
      const data = await res.json();
      if (data.ok) {
        loadArticles();
        showNotice("success", item.isPinned ? "文章已取消置顶。" : "文章已置顶。");
      } else {
        showNotice("error", data.error?.message || "切换置顶状态失败");
      }
    } catch {
      showNotice("error", "网络错误，请稍后重试。");
    }
  }

  async function handleDelete(id: string, title: string) {
    const item = items.find((candidate) => candidate.id === id) ?? null;
    if (!item) {
      return;
    }
    setPendingHide(item);
  }

  async function confirmHide() {
    if (!pendingHide) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/articles/${pendingHide.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setPendingHide(null);
        loadArticles();
        showNotice("success", "文章已隐藏。");
      } else {
        showNotice("error", data.error?.message || "操作失败");
      }
    } catch {
      showNotice("error", "网络错误，请稍后重试。");
    }
  }

  async function handleHardDelete(id: string, title: string) {
    const item = items.find((candidate) => candidate.id === id) ?? null;
    if (!item) {
      return;
    }
    setHardDeleteInput("");
    setPendingHardDelete(item);
  }

  async function confirmHardDelete() {
    if (!pendingHardDelete) {
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/articles/${pendingHardDelete.id}?permanent=true`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (data.ok) {
        setPendingHardDelete(null);
        setHardDeleteInput("");
        loadArticles();
        showNotice("success", "文章已永久删除。");
      } else {
        showNotice("error", data.error?.message || "永久删除失败");
      }
    } catch {
      showNotice("error", "网络错误，请稍后重试。");
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Wiki 管理</h1>
      </div>

      <div className={styles.filters}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <NeoInput
            placeholder="搜索标题..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <NeoButton type="submit" variant="secondary" size="sm">
            搜索
          </NeoButton>
        </form>

        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="按状态筛选"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {notice ? (
        <div
          className={`${styles.notice} ${
            notice.tone === "success"
              ? styles.noticeSuccess
              : notice.tone === "info"
                ? styles.noticeInfo
                : styles.noticeError
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      ) : null}

      {editItem && (
        <div
          className={styles.formOverlay}
          onClick={() => setEditItem(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditItem(null);
            }
          }}
        >
          <div
            className={styles.form}
            role="dialog"
            aria-modal="true"
            aria-label="编辑文章"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.formTitle}>编辑文章</h2>
            {error && <div className={styles.error}>{error}</div>}

            <NeoInput label="标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />

            <div className={styles.fieldGroup}>
              <label className={styles.label}>可见性</label>
              <select
                className={styles.filterSelect}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                {STATUS_OPTIONS.filter(Boolean).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <NeoInput
              label="标签（逗号分隔）"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
            />

            <div className={styles.formActions}>
              <NeoButton variant="primary" onClick={handleSave} isLoading={submitting}>
                保存
              </NeoButton>
              <NeoButton variant="secondary" onClick={() => setEditItem(null)}>
                取消
              </NeoButton>
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
                  <th>可见性</th>
                  <th>锁定</th>
                  <th>浏览</th>
                  <th>日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                    </td>
                    <td>{item.authorName}</td>
                    <td>
                      <span className={styles.statusBadge} data-status={item.status}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        data-status={item.isLocked ? "locked" : "unlocked"}
                      >
                        {item.isLocked ? "已锁定" : "开放编辑"}
                      </span>
                    </td>
                    <td>{item.viewCount}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td className={styles.actions}>
                      <NeoButton size="sm" variant="secondary" onClick={() => openEdit(item)}>
                        编辑
                      </NeoButton>
                      <NeoButton size="sm" variant="outline" onClick={() => handleTogglePin(item)}>
                        {item.isPinned ? "取消置顶" : "置顶"}
                      </NeoButton>
                      <NeoButton size="sm" variant="outline" onClick={() => handleToggleLock(item)}>
                        {item.isLocked ? "解锁" : "锁定"}
                      </NeoButton>
                      <NeoButton size="sm" variant="danger" onClick={() => handleDelete(item.id, item.title)}>
                        隐藏
                      </NeoButton>
                      <NeoButton
                        size="sm"
                        variant="danger"
                        onClick={() => handleHardDelete(item.id, item.title)}
                      >
                        永久删除
                      </NeoButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className={styles.pagination}>
              <NeoButton
                size="sm"
                variant="secondary"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                上一页
              </NeoButton>
              <span className={styles.pageInfo}>
                {pagination.page} / {pagination.totalPages}（共 {pagination.total} 条）
              </span>
              <NeoButton
                size="sm"
                variant="secondary"
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.totalPages}
              >
                下一页
              </NeoButton>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingHide !== null}
        title="隐藏文章"
        message={
          pendingHide
            ? `文章“${pendingHide.title}”会从前台列表中隐藏，但仍保留在后台。确认继续吗？`
            : ""
        }
        confirmLabel="确认隐藏"
        cancelLabel="取消"
        onCancel={() => setPendingHide(null)}
        onConfirm={confirmHide}
      />

      <ConfirmDialog
        open={pendingHardDelete !== null}
        title="永久删除文章"
        message={
          pendingHardDelete
            ? `永久删除后无法恢复。请输入文章标题“${pendingHardDelete.title}”确认操作。`
            : ""
        }
        confirmLabel="永久删除"
        cancelLabel="取消"
        inputLabel="确认标题"
        inputPlaceholder={pendingHardDelete?.title ?? ""}
        inputValue={hardDeleteInput}
        onInputChange={setHardDeleteInput}
        confirmDisabled={
          !pendingHardDelete || hardDeleteInput.trim() !== pendingHardDelete.title
        }
        onCancel={() => {
          setPendingHardDelete(null);
          setHardDeleteInput("");
        }}
        onConfirm={confirmHardDelete}
      />
    </div>
  );
}
