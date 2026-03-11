"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NeoButton from "@/components/atoms/NeoButton";
import ConfirmDialog from "@/components/molecules/ConfirmDialog";
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

interface NoticeState {
  tone: "success" | "error";
  message: string;
}

export default function HistoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reverting, setReverting] = useState<string | null>(null);
  const [pendingRevision, setPendingRevision] = useState<Revision | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  const handleRevert = async () => {
    if (!pendingRevision) return;
    setReverting(pendingRevision.id);
    try {
      const res = await fetch(`/api/wiki/${slug}/revert/${pendingRevision.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setNotice({ tone: "success", message: "已回退到所选版本。" });
        setPendingRevision(null);
        setPage(1);
      } else {
        setNotice({
          tone: "error",
          message: data.error?.message || "回退失败",
        });
      }
    } catch {
      setNotice({ tone: "error", message: "网络错误，请稍后重试。" });
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

      {notice ? (
        <div
          className={`${styles.notice} ${
            notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      ) : null}

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
                  onClick={() => setPendingRevision(rev)}
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

      <ConfirmDialog
        open={pendingRevision !== null}
        title="回退版本"
        message="当前内容会被保存成一个新版本记录，然后回退到你选择的历史版本。确认继续吗？"
        confirmLabel="确认回退"
        cancelLabel="取消"
        loading={pendingRevision ? reverting === pendingRevision.id : false}
        onCancel={() => setPendingRevision(null)}
        onConfirm={handleRevert}
      />
    </div>
  );
}
