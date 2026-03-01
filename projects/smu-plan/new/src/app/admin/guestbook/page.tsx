"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface MessageItem {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminGuestbookPage() {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/guestbook?page=${page}`);
      const data = await res.json();
      if (data.ok) {
        setItems(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadMessages(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除这条留言吗？")) return;
    try {
      const res = await fetch(`/api/admin/guestbook/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) loadMessages();
      else alert(data.error?.message || "删除失败");
    } catch {
      alert("网络错误");
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>留言管理</h1>
      </div>

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>暂无留言</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>内容</th>
                  <th>作者</th>
                  <th>时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.contentCell}>{item.content}</td>
                    <td>{item.authorName}</td>
                    <td className={styles.mono}>{formatDate(item.createdAt)}</td>
                    <td>
                      <NeoButton size="sm" variant="danger" onClick={() => handleDelete(item.id)}>删除</NeoButton>
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
