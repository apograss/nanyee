"use client";

import { Suspense, useDeferredValue, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import { useAuth } from "@/hooks/useAuth";
import { renderArticleBody } from "@/lib/wiki/render";

import { KB_EDITOR_MODES, type KbEditorMode } from "./config";
import styles from "./page.module.css";

const WikiEditor = dynamic(
  () => import("@/components/organisms/WikiEditor/WikiEditor"),
  {
    ssr: false,
    loading: () => <div className={styles.editorLoading}>加载编辑器中...</div>,
  },
);

function EditorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [format, setFormat] = useState<"html" | "markdown">("html");
  const [mode, setMode] = useState<KbEditorMode>("edit");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(editId));
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(false);

  const deferredContent = useDeferredValue(content);
  const deferredFormat = useDeferredValue(format);
  const isAdmin = user?.role === "admin";
  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  useEffect(() => {
    if (!editId) {
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/wiki/${editId}`);
        const data = await res.json();

        if (data.ok) {
          const article = data.data;
          setTitle(article.title || "");
          setSummary(article.summary || "");
          setCategory(article.category || "");
          setTagsInput(Array.isArray(article.tags) ? article.tags.join(", ") : "");
          setContent(article.content || "");
          setFormat(article.format || "html");
          setIsLocked(Boolean(article.isLocked));
        } else {
          setError("无法加载文章数据。");
        }
      } catch {
        setError("加载文章失败，请稍后重试。");
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [editId]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPreview() {
      setPreviewLoading(true);
      const html = await renderArticleBody({
        content: deferredContent || "<p></p>",
        format: deferredFormat,
      });
      if (!cancelled) {
        setPreviewHtml(html);
        setPreviewLoading(false);
      }
    }

    refreshPreview().catch(() => {
      if (!cancelled) {
        setPreviewHtml("<p>预览生成失败，请返回编辑后重试。</p>");
        setPreviewLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [deferredContent, deferredFormat]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        title,
        content,
        format,
        summary: summary || undefined,
        category: category || undefined,
        tags: tags.length > 0 ? tags : undefined,
        editSummary: editSummary || undefined,
      };

      const res = await fetch(editId ? `/api/wiki/${editId}` : "/api/wiki", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || (editId ? "更新文章失败。" : "创建文章失败。"));
        return;
      }

      router.push(`/kb/${data.data.slug}`);
    } catch {
      setError("网络错误，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading || authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>正在准备编辑器...</div>
      </div>
    );
  }

  if (!user) {
    const redirect = `/editor${editId ? `?id=${editId}` : ""}`;
    return (
      <div className={styles.page}>
        <div className={styles.noticeCard}>
          <p className={styles.noticeKicker}>先登录再参与共建</p>
          <h1 className={styles.title}>需要登录</h1>
          <p className={styles.desc}>登录后你就可以新建词条、补充经验，或修正文档中的过期信息。</p>
          <Link href={`/login?redirect=${encodeURIComponent(redirect)}`}>
            <NeoButton>前往登录</NeoButton>
          </Link>
        </div>
      </div>
    );
  }

  if (isLocked && !isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.noticeCard}>
          <p className={styles.noticeKicker}>当前条目受保护</p>
          <h1 className={styles.title}>文章已锁定</h1>
          <p className={styles.desc}>这篇文章已被管理员锁定，暂时不能继续编辑。</p>
          <NeoButton onClick={() => router.back()} variant="secondary">
            返回上一页
          </NeoButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <p className={styles.kicker}>{editId ? "编辑知识库条目" : "发起一次共建"}</p>
          <h1 className={styles.title}>{editId ? "编辑文章" : "新建文章"}</h1>
          <p className={styles.desc}>
            {editId
              ? "完善内容、修正错误或补充最新经验。保存后会即时生效，并留下版本历史。"
              : "把你知道的经验写下来，让后面的人少走弯路。保存后会直接发布到知识库。"}
          </p>
        </div>

        <div className={styles.heroMeta}>
          <span className={styles.heroMetaItem}>即时发布</span>
          <span className={styles.heroMetaItem}>版本留痕</span>
          <span className={styles.heroMetaItem}>欢迎补充纠错</span>
        </div>
      </div>

      {isLocked && isAdmin && (
        <div className={styles.warningBanner}>
          当前文章已锁定，你正在以管理员身份编辑。保存后仍会保留锁定状态。
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.metaGrid}>
          <NeoInput label="标题" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <NeoInput
            label="分类"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例如：校园生活、学业、工具"
          />
          <div className={styles.metaWide}>
            <NeoInput
              label="摘要"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="用一句话告诉读者，这篇文章能帮他解决什么问题"
            />
          </div>
          <div className={styles.metaWide}>
            <NeoInput
              label="标签"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：选课, 实习, 转专业, 图书馆"
            />
          </div>
        </div>

        <div className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.surfaceTitle}>正文内容</p>
              <p className={styles.surfaceHint}>支持富文本编辑，也可以随时切换到预览确认排版效果。</p>
            </div>
            <div className={styles.modeSwitch} role="tablist" aria-label="编辑模式切换">
              {KB_EDITOR_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.modeButton} ${mode === item.id ? styles.modeButtonActive : ""}`}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "edit" ? (
            <WikiEditor content={content} onChange={setContent} />
          ) : (
            <div className={styles.previewShell}>
              <div className={styles.previewMeta}>
                <h2>{title || "未命名文章"}</h2>
                {(summary || category || tags.length > 0) && (
                  <div className={styles.previewInfo}>
                    {summary && <p>{summary}</p>}
                    <div className={styles.previewBadges}>
                      {category && <span className={styles.previewBadge}>{category}</span>}
                      {tags.map((tag) => (
                        <span key={tag} className={styles.previewBadge}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {previewLoading ? (
                <div className={styles.previewLoading}>正在生成预览...</div>
              ) : (
                <article
                  className={styles.previewContent}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
          )}
        </div>

        {editId && (
          <NeoInput
            label="本次修改说明"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            placeholder="例如：补充奖学金申报时间，修正选课入口说明"
          />
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <NeoButton type="submit" isLoading={loading}>
            {editId ? "保存修改" : "发布文章"}
          </NeoButton>
          <NeoButton
            type="button"
            variant="secondary"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "先看预览" : "返回编辑"}
          </NeoButton>
        </div>
      </form>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.loadingCard}>加载中...</div></div>}>
      <EditorInner />
    </Suspense>
  );
}
