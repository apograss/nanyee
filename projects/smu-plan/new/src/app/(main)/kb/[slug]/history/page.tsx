"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./history.module.css";

interface Revision {
  id: string;
  title: string;
  editorName: string;
  editSummary: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export default function HistoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reverting, setReverting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wiki/${slug}/revisions?page=${page}`);
        const data = await res.json();
        if (data.ok) {
          setRevisions(data.data.revisions);
          setPagination(data.data.pagination);
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug, page]);

  const handleRevert = async (revId: string) => {
    if (!window.confirm("确定要回退到此版本吗？当前内容将被保存为一个新版本记录。")) return;
    setReverting(revId);
    try {
      const res = await fetch(`/api/wiki/${slug}/revert/${revId}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        alert("已回退成功");
        setPage(1);
      } else {
        alert(data.error?.message || "回退失败");
      }
    } catch {
      alert("网络错误");
    }
    setReverting(null);
  };

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>版本历史</h1>
        <Link href={`/kb/${slug}`} className={styles.backLink}>
          返回文章
        </Link>
      </div>

      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : revisions.length === 0 ? (
        <div className={styles.empty}>暂无编辑历史</div>
      ) : (
        <>
          <div className={styles.list}>
            {revisions.map((rev) => (
              <div key={rev.id} className={styles.revisionCard}>
                <div className={styles.revisionMain}>
                  <div className={styles.revisionTitle}>{rev.title}</div>
                  <div className={styles.revisionMeta}>
                    <span>{rev.editorName}</span>
                    <span>{new Date(rev.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  {rev.editSummary && (
                    <div className={styles.revisionSummary}>{rev.editSummary}</div>
                  )}
                </div>
                <NeoButton
                  size="sm"
                  variant="secondary"
                  onClick={() => handleRevert(rev.id)}
                  isLoading={reverting === rev.id}
                >
                  回退
                </NeoButton>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
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
                {page} / {totalPages}
              </span>
              <NeoButton
                size="sm"
                variant="secondary"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                下一页
              </NeoButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
