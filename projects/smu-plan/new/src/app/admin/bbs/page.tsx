"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

interface TopicItem {
  id: string;
  title: string;
  category: string;
  authorId: string;
  pinned: boolean;
  locked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
}

interface ReplyItem {
  id: string;
  content: string;
  authorId: string;
  topicId: string;
  createdAt: string;
  topic: { title: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminBbsPage() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  // Replies drawer
  const [drawerTopicId, setDrawerTopicId] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString() });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/bbs/topics?${params}`);
      const data = await res.json();
      if (data.ok) {
        setTopics(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadTopics(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadTopics();
  };

  const handleToggle = async (topic: TopicItem, field: "pinned" | "locked") => {
    try {
      const res = await fetch(`/api/admin/bbs/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !topic[field] }),
      });
      const data = await res.json();
      if (data.ok) loadTopics();
    } catch {}
  };

  const handleDeleteTopic = async (id: string, title: string) => {
    if (!window.confirm(`确定要删除帖子 "${title}" 吗？回复也会被删除。`)) return;
    try {
      const res = await fetch(`/api/admin/bbs/topics/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) loadTopics();
      else alert(data.error?.message || "删除失败");
    } catch {
      alert("网络错误");
    }
  };

  const openReplies = async (topicId: string) => {
    setDrawerTopicId(topicId);
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/admin/bbs/replies?topicId=${topicId}`);
      const data = await res.json();
      if (data.ok) setReplies(data.data.items);
    } catch {}
    setRepliesLoading(false);
  };

  const handleDeleteReply = async (id: string) => {
    if (!window.confirm("确定要删除这条回复吗？")) return;
    try {
      const res = await fetch(`/api/admin/bbs/replies/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok && drawerTopicId) {
        openReplies(drawerTopicId);
        loadTopics();
      } else {
        alert(data.error?.message || "删除失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>论坛管理</h1>
      </div>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <NeoInput placeholder="搜索帖子标题..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <NeoButton type="submit" variant="secondary" size="sm">搜索</NeoButton>
      </form>

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : topics.length === 0 ? (
        <div className={styles.empty}>暂无帖子</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>分区</th>
                  <th>置顶</th>
                  <th>锁定</th>
                  <th>回复</th>
                  <th>日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.title}</strong></td>
                    <td>{t.category}</td>
                    <td>
                      <button
                        role="switch"
                        aria-checked={t.pinned}
                        className={`${styles.toggle} ${t.pinned ? styles.on : styles.off}`}
                        onClick={() => handleToggle(t, "pinned")}
                      >
                        {t.pinned ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td>
                      <button
                        role="switch"
                        aria-checked={t.locked}
                        className={`${styles.toggle} ${t.locked ? styles.on : styles.off}`}
                        onClick={() => handleToggle(t, "locked")}
                      >
                        {t.locked ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td>
                      <button className={styles.replyBtn} onClick={() => openReplies(t.id)}>
                        {t.replyCount} 条
                      </button>
                    </td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>
                      <NeoButton size="sm" variant="danger" onClick={() => handleDeleteTopic(t.id, t.title)}>删除</NeoButton>
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

      {/* Replies drawer */}
      {drawerTopicId && (
        <div className={styles.drawerOverlay} onClick={() => setDrawerTopicId(null)} onKeyDown={(e) => { if (e.key === "Escape") setDrawerTopicId(null); }}>
          <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="回复列表" onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>回复列表</h2>
              <NeoButton size="sm" variant="secondary" onClick={() => setDrawerTopicId(null)}>关闭</NeoButton>
            </div>
            {repliesLoading ? (
              <div className={styles.empty}>加载中...</div>
            ) : replies.length === 0 ? (
              <div className={styles.empty}>暂无回复</div>
            ) : (
              <div className={styles.replyList}>
                {replies.map((r) => (
                  <div key={r.id} className={styles.replyItem}>
                    <div className={styles.replyContent}>{r.content}</div>
                    <div className={styles.replyMeta}>
                      <span>{formatDate(r.createdAt)}</span>
                      <NeoButton size="sm" variant="danger" onClick={() => handleDeleteReply(r.id)}>删除</NeoButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
