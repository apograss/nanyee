"use client";

import {
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const CONTENT_FORMAT_OPTIONS = [
  { id: "html", label: "富文本 / HTML" },
  { id: "markdown", label: "Markdown" },
] as const;

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
  const [format, setFormat] = useState<"html" | "markdown">("html");
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
  const isAdmin = user?.role === "admin";
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

  async function loadCategories() {
    setCategoryLoading(true);
    try {
      const res = await fetch("/api/wiki/categories");
      const data = await res.json();
      if (data.ok) {
        setCategoryTree(data.data.categories || []);
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
          setFormat(article.format || "html");
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

  async function openCreateChildCategory() {
    if (!parentCategoryId) {
      setError("请先选择一个母分类，再创建子分类。");
      return;
    }
    setCategoryEditorMode("create");
    setCategoryNameDraft("");
    setCategoryIconDraft("");
    setCategoryEditorOpen(true);
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

  function handleFormatChange(nextFormat: "html" | "markdown") {
    if (nextFormat === format) {
      return;
    }

    startTransition(() => {
      setFormat(nextFormat);
    });
    setFormatNotice("切换内容格式不会自动转换已有内容，发布前请先看预览。");
  }

  function handleOpenHtmlImport() {
    if (format !== "html") {
      handleFormatChange("html");
    }
    htmlImportRef.current?.click();
  }

  function handleHtmlImport(event: React.ChangeEvent<HTMLInputElement>) {
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

    const reader = new FileReader();
    reader.onload = () => {
      const nextContent = typeof reader.result === "string" ? reader.result : "";
      setFormat("html");
      setContent(nextContent);
      setError("");
      setFormatNotice(`已导入 HTML 文件：${file.name}`);
    };
    reader.onerror = () => {
      setError("HTML 文件读取失败，请换一个文件再试。");
    };
    reader.readAsText(file, "utf-8");
  }

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
            onChange={(e) => setTitle(e.target.value)}
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
                  onChange={(e) => {
                    setParentCategoryId(e.target.value);
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
                  onChange={(e) => setChildCategoryId(e.target.value)}
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
                  onChange={(e) => setCategoryNameDraft(e.target.value)}
                  placeholder="例如：本科生学习指南"
                />
                <NeoInput
                  label="图标"
                  value={categoryIconDraft}
                  onChange={(e) => setCategoryIconDraft(e.target.value)}
                  placeholder="例如：📘"
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
                  {selectedCategory.child.icon || "📄"} {selectedCategory.child.name}
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
              <p className={styles.surfaceHint}>
                富文本模式适合所见即所得，Markdown 模式适合手写文档；预览会按真实发布效果渲染。
              </p>
            </div>

            <div className={styles.surfaceHeaderActions}>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>内容格式</span>
                <div className={styles.formatSwitch}>
                  {CONTENT_FORMAT_OPTIONS.map((item) => (
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
              {formatNotice || "切换内容格式不会自动转换已有内容；HTML 模式支持导入 .html 文件。"}
            </p>
          </div>

          {mode === "edit" ? (
            <div className={styles.editorStage}>
              {format === "markdown" ? (
                <div className={styles.sourceWrap}>
                  <p className={styles.editorHint}>
                    当前是 Markdown 模式，文章详情页会按 Markdown 渲染展示。
                  </p>
                  <textarea
                    className={styles.sourceEditor}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={"使用 Markdown 编写正文，例如：\n# 标题\n\n- 要点一\n- 要点二"}
                    spellCheck={false}
                  />
                </div>
              ) : (
                <>
                  <div className={styles.editorTools}>
                    <p className={styles.editorHint}>
                      当前是富文本 / HTML 模式。你可以直接可视化编辑，也可以导入现成 HTML 文件。
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
                  <WikiEditor content={content} onChange={setContent} />
                </>
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
                          {selectedCategory.child.icon || "📄"} {selectedCategory.child.name}
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

        {editId ? (
          <NeoInput
            label="本次修改说明"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            placeholder="例如：补充奖学金申报时间，修正选课入口说明"
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
