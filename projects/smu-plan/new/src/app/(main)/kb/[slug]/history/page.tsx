"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import NeoButton from "@/components/atoms/NeoButton";
import ConfirmDialog from "@/components/molecules/ConfirmDialog";
import WikiDiffView, {
  type WikiDiffVersion,
} from "@/components/organisms/WikiDiffView/WikiDiffView";
import styles from "./history.module.css";

interface Revision {
  id: string;
  title: string;
  format: string;
  summary: string | null;
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

interface RevisionDetail {
  id: string;
  title: string;
  content: string;
  format: string;
  summary: string | null;
  editorName: string;
  createdAt: string;
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
  const [diffingRevisionId, setDiffingRevisionId] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<{
    current: WikiDiffVersion;
    revision: WikiDiffVersion;
  } | null>(null);

  const readApiPayload = useCallback(async (response: Response) => {
    const raw = await response.text();

    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {
        ok: false,
        error: {
          message: raw.trim() || `请求失败（${response.status}）`,
        },
      };
    }
  }, []);

  const loadRevisions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wiki/${slug}/revisions?page=${page}`);
      const data = await readApiPayload(res);
      if (res.ok && data.ok) {
        setRevisions(data.data.revisions);
        setPagination(data.data.pagination);
        setNotice(null);
      } else {
        setNotice({
          tone: "error",
          message: data.error?.message || "加载历史版本失败",
        });
      }
    } catch {
      setNotice({ tone: "error", message: "网络错误，请稍后重试。" });
    }
    setLoading(false);
  }, [page, readApiPayload, slug]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  const handleOpenDiff = useCallback(
    async (revision: Revision) => {
      if (diffingRevisionId === revision.id && diffData) {
        setDiffingRevisionId(null);
        setDiffData(null);
        return;
      }

      setDiffingRevisionId(revision.id);
      setDiffData(null);
      setNotice(null);

      try {
        const [currentRes, revisionRes] = await Promise.all([
          fetch(`/api/wiki/${slug}`),
          fetch(`/api/wiki/${slug}/revisions/${revision.id}`),
        ]);
        const [currentData, revisionData] = await Promise.all([
          readApiPayload(currentRes),
          readApiPayload(revisionRes),
        ]);

        if (!currentRes.ok || !currentData.ok) {
          throw new Error(currentData.error?.message || "当前版本加载失败");
        }
        if (!revisionRes.ok || !revisionData.ok) {
          throw new Error(revisionData.error?.message || "历史版本加载失败");
        }

        setDiffData({
          current: {
            label: "当前版本",
            title: currentData.data.title,
            summary: currentData.data.summary,
            content: currentData.data.content,
            format: currentData.data.format,
          },
          revision: {
            label: new Date(revision.createdAt).toLocaleString("zh-CN"),
            title: revisionData.data.revision.title,
            summary: revisionData.data.revision.summary,
            content: revisionData.data.revision.content,
            format: revisionData.data.revision.format,
            editorName: revisionData.data.revision.editorName,
            createdAt: revisionData.data.revision.createdAt,
          },
        });
      } catch (error) {
        setDiffingRevisionId(null);
        setDiffData(null);
        setNotice({
          tone: "error",
          message:
            error instanceof Error ? error.message : "加载版本对比失败，请稍后重试。",
        });
      }
    },
    [diffData, diffingRevisionId, readApiPayload, slug],
  );

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
        setDiffData(null);
        setDiffingRevisionId(null);
        if (page === 1) {
          await loadRevisions();
        } else {
          setPage(1);
        }
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
              <div key={rev.id}>
                <div className={styles.revisionCard}>
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
                  <div className={styles.revisionActions}>
                    <NeoButton
                      size="sm"
                      variant={diffingRevisionId === rev.id && diffData ? "primary" : "secondary"}
                      onClick={() => handleOpenDiff(rev)}
                      isLoading={diffingRevisionId === rev.id && !diffData}
                    >
                      对比
                    </NeoButton>
                    <NeoButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setPendingRevision(rev)}
                      isLoading={reverting === rev.id}
                    >
                      回退
                    </NeoButton>
                  </div>
                </div>
                {diffingRevisionId === rev.id && diffData ? (
                  <div className={styles.inlineDiff}>
                    <WikiDiffView current={diffData.current} revision={diffData.revision} />
                  </div>
                ) : null}
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
