"use client";

import {
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import InteractiveHtmlFrame from "@/components/molecules/InteractiveHtmlFrame";
import { useAuth } from "@/hooks/useAuth";
import { canUseInteractiveHtml, type ArticleFormat } from "@/lib/wiki/formats";
import { renderArticleBody } from "@/lib/wiki/render";

import { KB_EDITOR_MODES, type KbEditorMode } from "./config";
import styles from "./page.module.css";

const WikiEditor = dynamic(
  () => import("@/components/organisms/WikiEditor/WikiEditor"),
  {
    ssr: false,
    loading: () => <div className={styles.editorLoading}>编辑器加载中...</div>,
  },
);

const CONTENT_FORMAT_OPTIONS = [
  { id: "html", label: "富文本 / HTML" },
  { id: "markdown", label: "Markdown" },
  { id: "interactive-html", label: "互动 HTML" },
] as const satisfies ReadonlyArray<{ id: ArticleFormat; label: string }>;

interface WikiCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  articleCount: number;
  children: WikiCategoryNode[];
}

function findSelectedCategory(tree: WikiCategoryNode[], childId: string) {
  for (const parent of tree) {
    const child = parent.children.find((item) => item.id === childId);
    if (child) {
      return { parent, child };
    }
  }
  return null;
}

function EditorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const { user, loading: authLoading } = useAuth();
  const htmlImportRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [format, setFormat] = useState<ArticleFormat>("html");
  const [mode, setMode] = useState<KbEditorMode>("edit");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(editId));
  const [error, setError] = useState("");
  const [formatNotice, setFormatNotice] = useState("");
  const [isLocked, setIsLocked] = useState(false);

  const [categoryTree, setCategoryTree] = useState<WikiCategoryNode[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [parentCategoryId, setParentCategoryId] = useState("");
  const [childCategoryId, setChildCategoryId] = useState("");
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [categoryEditorMode, setCategoryEditorMode] = useState<"create" | "edit">("create");
  const [categoryNameDraft, setCategoryNameDraft] = useState("");
  const [categoryIconDraft, setCategoryIconDraft] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const deferredContent = useDeferredValue(content);
  const deferredFormat = useDeferredValue(format);

  // Auto-save drafts to localStorage
  const draftKey = editId ? `wiki-draft-${editId}` : "wiki-draft-new";
  const draftLoaded = useRef(false);

  useEffect(() => {
    if (draftLoaded.current || initialLoading) return;
    draftLoaded.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as { title?: string; content?: string; summary?: string; tagsInput?: string; format?: string; ts?: number };
      // Only restore if draft is less than 7 days old
      if (draft.ts && Date.now() - draft.ts > 7 * 24 * 3600_000) {
        localStorage.removeItem(draftKey);
        return;
      }
      // Don't overwrite data loaded from the server for edit mode
      if (editId) return;
      if (draft.title) setTitle(draft.title);
      if (draft.content) setContent(draft.content);
      if (draft.summary) setSummary(draft.summary);
      if (draft.tagsInput) setTagsInput(draft.tagsInput);
      if (draft.format) setFormat(draft.format as ArticleFormat);
    } catch {}
  }, [draftKey, initialLoading, editId]);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ title, content, summary, tagsInput, format, ts: Date.now() }));
      } catch {}
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content, summary, tagsInput, format, draftKey]);

  const isAdmin = user?.role === "admin";
  const canEditInteractive = canUseInteractiveHtml(user?.role);
  const visibleFormatOptions = canEditInteractive
    ? CONTENT_FORMAT_OPTIONS
    : CONTENT_FORMAT_OPTIONS.filter((item) => item.id !== "interactive-html");
  const tags = tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const selectedCategory = useMemo(
    () => findSelectedCategory(categoryTree, childCategoryId),
    [categoryTree, childCategoryId],
  );
  const activeParent = selectedCategory?.parent
    ?? categoryTree.find((parent) => parent.id === parentCategoryId)
    ?? null;
  const childOptions = activeParent?.children ?? [];
  const isSourceMode = format !== "html";

  async function loadCategories() {
    setCategoryLoading(true);
    try {
      const res = await fetch("/api/wiki/categories");
      const data = await res.json();
      if (data.ok) {
        setCategoryTree(data.data.categories || []);
      } else {
        setCategoryTree([]);
      }
    } catch {
      setCategoryTree([]);
    } finally {
      setCategoryLoading(false);
    }
  }

  useEffect(() => {
    loadCategories().catch(() => {});
  }, []);

  useEffect(() => {
    if (!pendingCategoryId || categoryTree.length === 0) {
      return;
    }

    const match = findSelectedCategory(categoryTree, pendingCategoryId);
    if (match) {
      setParentCategoryId(match.parent.id);
      setChildCategoryId(match.child.id);
      setPendingCategoryId(null);
    }
  }, [pendingCategoryId, categoryTree]);

  useEffect(() => {
    if (!editId) {
      setInitialLoading(false);
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
          setTagsInput(Array.isArray(article.tags) ? article.tags.join(", ") : "");
          setContent(article.content || "");
          setFormat((article.format || "html") as ArticleFormat);
          setIsLocked(Boolean(article.isLocked));
          setPendingCategoryId(article.categoryId || null);
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

    if (deferredFormat === "interactive-html") {
      setPreviewHtml("");
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);

    // Debounce preview rendering to reduce CPU overhead from marked + sanitize-html
    const timer = setTimeout(() => {
      renderArticleBody({
        content: deferredContent || "<p></p>",
        format: deferredFormat,
      })
        .then((html) => {
          if (!cancelled) {
            setPreviewHtml(html);
            setPreviewLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewHtml("<p>预览生成失败，请返回编辑后重试。</p>");
            setPreviewLoading(false);
          }
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredContent, deferredFormat]);

  async function openCreateChildCategory() {
    if (!parentCategoryId) {
      setError("请先选择一个母分类，再创建子分类。");
      return;
    }

    setCategoryEditorMode("create");
    setCategoryNameDraft("");
    setCategoryIconDraft("");
    setCategoryEditorOpen(true);
    setError("");
  }

  function openEditChildCategory() {
    if (!selectedCategory?.child) {
      setError("请先选择一个子分类。");
      return;
    }

    setCategoryEditorMode("edit");
    setCategoryNameDraft(selectedCategory.child.name);
    setCategoryIconDraft(selectedCategory.child.icon || "");
    setCategoryEditorOpen(true);
    setError("");
  }

  async function handleSaveCategory() {
    if (!parentCategoryId || !categoryNameDraft.trim()) {
      setError("请先选择母分类，并填写子分类名称。");
      return;
    }

    setCategorySaving(true);
    setError("");

    try {
      const isEditing = categoryEditorMode === "edit" && childCategoryId;
      const url = isEditing
        ? `/api/wiki/categories/${childCategoryId}`
        : "/api/wiki/categories";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryNameDraft.trim(),
          icon: categoryIconDraft.trim() || undefined,
          parentId: parentCategoryId,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error?.message || "保存分类失败。");
        return;
      }

      const saved = data.data.category;
      await loadCategories();
      setChildCategoryId(saved.id);
      setPendingCategoryId(saved.id);
      setCategoryEditorOpen(false);
      setCategoryNameDraft("");
      setCategoryIconDraft("");
    } catch {
      setError("保存分类失败，请稍后重试。");
    } finally {
      setCategorySaving(false);
    }
  }

  function handleFormatChange(nextFormat: ArticleFormat) {
    if (nextFormat === format) {
      return;
    }

    if (nextFormat === "interactive-html" && !canEditInteractive) {
      setError("只有管理员可以使用互动 HTML 模式。");
      return;
    }

    startTransition(() => {
      setFormat(nextFormat);
      if (nextFormat !== "html") {
        setMode("edit");
      }
    });

    if (nextFormat === "interactive-html") {
      setFormatNotice("互动 HTML 会通过沙箱 iframe 运行，适合小游戏、演示页和交互实验。");
    } else if (nextFormat === "markdown") {
      setFormatNotice("Markdown 会按源码保存，并在文章页渲染成常规排版。");
    } else {
      setFormatNotice("富文本 / HTML 适合普通图文内容，发布时会做安全净化。");
    }
  }

  function handleOpenHtmlImport() {
    htmlImportRef.current?.click();
  }

  function handleHtmlImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const isHtmlFile =
      file.name.toLowerCase().endsWith(".html")
      || file.type === "text/html";

    if (!isHtmlFile) {
      setError("只能导入 .html 文件。");
      return;
    }

    const currentFormat = format;
    const reader = new FileReader();
    reader.onload = () => {
      const nextContent = typeof reader.result === "string" ? reader.result : "";
      const looksInteractive = /<script[\s>]|<canvas[\s>]|requestAnimationFrame/i.test(
        nextContent,
      );

      if (currentFormat === "interactive-html" || (looksInteractive && canEditInteractive)) {
        setFormat("interactive-html");
        setFormatNotice(`已导入互动 HTML 文件：${file.name}`);
      } else {
        setFormat("html");
        setFormatNotice(
          looksInteractive && canEditInteractive
            ? `已导入 HTML 文件：${file.name}。检测到可执行内容，如需直接运行，请切换到“互动 HTML”。`
            : `已导入 HTML 文件：${file.name}`,
        );
      }

      setContent(nextContent);
      setError("");
    };
    reader.onerror = () => {
      setError("HTML 文件读取失败，请换一个文件再试。");
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        title,
        content,
        format,
        summary: summary || undefined,
        categoryId: childCategoryId || undefined,
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

      // Clear draft on successful save
      try { localStorage.removeItem(draftKey); } catch {}
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
          <p className={styles.desc}>
            登录后你就可以新建词条、补充经验，或修正文档中的过期信息。
          </p>
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

      {isLocked && isAdmin ? (
        <div className={styles.warningBanner}>
          当前文章已锁定，你正在以管理员身份编辑。保存后仍会保留锁定状态。
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.metaGrid}>
          <NeoInput
            label="标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />

          <div className={styles.categoryBox}>
            <label className={styles.categoryLabel}>知识库分类</label>
            <div className={styles.categoryGrid}>
              <div className={styles.categoryField}>
                <span className={styles.categoryFieldLabel}>母分类</span>
                <select
                  className={styles.categorySelect}
                  value={parentCategoryId}
                  onChange={(event) => {
                    setParentCategoryId(event.target.value);
                    setChildCategoryId("");
                  }}
                  disabled={categoryLoading || categoryTree.length === 0}
                >
                  <option value="">请选择母分类</option>
                  {categoryTree.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.icon ? `${parent.icon} ` : ""}
                      {parent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.categoryField}>
                <span className={styles.categoryFieldLabel}>子分类</span>
                <select
                  className={styles.categorySelect}
                  value={childCategoryId}
                  onChange={(event) => setChildCategoryId(event.target.value)}
                  disabled={!activeParent || childOptions.length === 0}
                >
                  <option value="">
                    {activeParent ? "请选择子分类" : "请先选择母分类"}
                  </option>
                  {childOptions.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.icon ? `${child.icon} ` : ""}
                      {child.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.categoryActions}>
              <NeoButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={openCreateChildCategory}
              >
                新建子分类
              </NeoButton>
              <NeoButton
                type="button"
                variant="outline"
                size="sm"
                onClick={openEditChildCategory}
                disabled={!selectedCategory?.child}
              >
                编辑子分类
              </NeoButton>
            </div>

            {categoryEditorOpen ? (
              <div className={styles.categoryEditor}>
                <NeoInput
                  label={categoryEditorMode === "create" ? "子分类名称" : "修改子分类名称"}
                  value={categoryNameDraft}
                  onChange={(event) => setCategoryNameDraft(event.target.value)}
                  placeholder="例如：本科生学习指南"
                />
                <NeoInput
                  label="图标"
                  value={categoryIconDraft}
                  onChange={(event) => setCategoryIconDraft(event.target.value)}
                  placeholder="例如：📚"
                  maxLength={8}
                />
                <div className={styles.categoryActions}>
                  <NeoButton
                    type="button"
                    size="sm"
                    onClick={handleSaveCategory}
                    isLoading={categorySaving}
                  >
                    保存子分类
                  </NeoButton>
                  <NeoButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCategoryEditorOpen(false)}
                  >
                    取消
                  </NeoButton>
                </div>
              </div>
            ) : null}

            {selectedCategory?.child ? (
              <div className={styles.categoryHint}>
                当前将发布到{" "}
                <strong>
                  {selectedCategory.parent.icon || "📚"} {selectedCategory.parent.name}
                </strong>
                {" / "}
                <strong>
                  {selectedCategory.child.icon || "🧩"} {selectedCategory.child.name}
                </strong>
              </div>
            ) : (
              <div className={styles.categoryHint}>
                文章会归档到某个子分类下；母分类由管理员维护，子分类可以继续共建。
              </div>
            )}
          </div>

          <div className={styles.metaWide}>
            <NeoInput
              label="摘要"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="用一句话告诉读者，这篇文章能帮他解决什么问题"
            />
          </div>

          <div className={styles.metaWide}>
            <NeoInput
              label="标签"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="例如：选课, 实习, 转专业, 图书馆"
            />
          </div>
        </div>

        <div className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.surfaceTitle}>正文内容</p>
              <p className={styles.surfaceHint}>
                富文本适合普通图文；Markdown 适合源码写作；互动 HTML 适合沙箱运行的小工具和小游戏。
              </p>
            </div>

            <div className={styles.surfaceHeaderActions}>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>内容格式</span>
                <div className={styles.formatSwitch}>
                  {visibleFormatOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.formatButton} ${format === item.id ? styles.formatButtonActive : ""}`}
                      onClick={() => handleFormatChange(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>编辑模式</span>
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
            </div>
          </div>

          <div className={styles.surfaceMeta}>
            <p className={styles.formatNote}>
              {formatNotice || "切换内容格式不会自动转换已有内容，发布前请先看一遍预览。"}
            </p>
          </div>

          {mode === "edit" ? (
            <div className={styles.editorStage}>
              {format !== "markdown" ? (
                <div className={styles.editorTools}>
                  <p className={styles.editorHint}>
                    {format === "interactive-html"
                      ? "互动 HTML 会在沙箱 iframe 中运行，不会直接进入主站上下文。"
                      : "富文本 / HTML 模式适合普通文章；导入完整 HTML 文件后，预览仍会按安全文章模式显示。"}
                  </p>
                  <input
                    ref={htmlImportRef}
                    type="file"
                    accept=".html,text/html"
                    className={styles.hiddenFileInput}
                    onChange={handleHtmlImport}
                  />
                  <NeoButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenHtmlImport}
                  >
                    导入 HTML 文件
                  </NeoButton>
                </div>
              ) : null}

              {isSourceMode ? (
                <div className={styles.sourceWrap}>
                  <p className={styles.editorHint}>
                    {format === "interactive-html"
                      ? "这里保存的是完整 HTML 源码。发布后文章页会用沙箱 iframe 运行它。"
                      : "这里保存的是 Markdown 源码。文章页会按常规 Markdown 排版渲染。"}
                  </p>
                  <textarea
                    className={styles.sourceEditor}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={
                      format === "interactive-html"
                        ? "<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>小游戏</title>\n  </head>\n  <body>...</body>\n</html>"
                        : "# 标题\n\n- 要点一\n- 要点二"
                    }
                    spellCheck={false}
                  />
                </div>
              ) : (
                <WikiEditor content={content} onChange={setContent} />
              )}
            </div>
          ) : (
            <div className={styles.previewShell}>
              <div className={styles.previewMeta}>
                <h2>{title || "未命名文章"}</h2>
                {(summary || selectedCategory?.child || tags.length > 0) ? (
                  <div className={styles.previewInfo}>
                    {summary ? <p>{summary}</p> : null}
                    <div className={styles.previewBadges}>
                      {selectedCategory?.parent ? (
                        <span className={styles.previewBadge}>
                          {selectedCategory.parent.icon || "📚"} {selectedCategory.parent.name}
                        </span>
                      ) : null}
                      {selectedCategory?.child ? (
                        <span className={styles.previewBadge}>
                          {selectedCategory.child.icon || "🧩"} {selectedCategory.child.name}
                        </span>
                      ) : null}
                      {tags.map((tag) => (
                        <span key={tag} className={styles.previewBadge}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {format === "interactive-html" ? (
                <div className={styles.interactivePreviewWrap}>
                  <InteractiveHtmlFrame
                    html={content}
                    title={title || "互动 HTML 预览"}
                    className={styles.interactivePreviewFrame}
                  />
                </div>
              ) : previewLoading ? (
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

        {editId ? (
          <NeoInput
            label="本次修改说明"
            value={editSummary}
            onChange={(event) => setEditSummary(event.target.value)}
            placeholder="例如：补充奖学金申请时间，修正选课入口说明"
          />
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

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
    <Suspense
      fallback={(
        <div className={styles.page}>
          <div className={styles.loadingCard}>加载中...</div>
        </div>
      )}
    >
      <EditorInner />
    </Suspense>
  );
}
