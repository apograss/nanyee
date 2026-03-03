"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

export default function EditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!editId);
  const [error, setError] = useState("");

  // Load existing article data when editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch(`/api/wiki/${editId}`);
        const data = await res.json();
        if (data.ok) {
          const a = data.data;
          setTitle(a.title || "");
          setSummary(a.summary || "");
          setCategory(a.category || "");
          setTagsInput(Array.isArray(a.tags) ? a.tags.join(", ") : "");
          setContent(a.content || "");
        } else {
          setError("无法加载文章数据");
        }
      } catch {
        setError("加载文章失败");
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [editId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (editId) {
        // Update existing article
        const res = await fetch(`/api/wiki/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            summary: summary || undefined,
            category: category || undefined,
            tags: tags.length > 0 ? tags : undefined,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          setError(data.error?.message || "更新文章失败");
          return;
        }

        router.push(`/kb/${data.data.slug}`);
      } else {
        // Create new article
        const res = await fetch("/api/wiki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            summary: summary || undefined,
            category: category || undefined,
            tags: tags.length > 0 ? tags : undefined,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          setError(data.error?.message || "Failed to create article");
          return;
        }

        // Submit for review
        await fetch(`/api/wiki/${data.data.id}`, {
          method: "POST",
        });

        router.push("/kb");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className={styles.page}>
        <p style={{ textAlign: "center", padding: "2rem", fontWeight: "bold" }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{editId ? "编辑文章" : "投稿"}</h1>
      <p className={styles.desc}>{editId ? "修改已发表的文章" : "分享你的校园经验与知识"}</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <NeoInput
          label="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <NeoInput
          label="摘要（可选）"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="简短描述文章内容"
        />
        <NeoInput
          label="分类（可选）"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="如: 校园生活、学业、工具"
        />
        <NeoInput
          label="标签（逗号分隔）"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="如: 选课,转专业,GPA"
        />

        <div className={styles.editorWrap}>
          <label className={styles.label}>正文（Markdown）</label>
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="支持 Markdown 格式..."
            rows={20}
            required
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <NeoButton type="submit" isLoading={loading}>
          {editId ? "保存修改" : "提交审核"}
        </NeoButton>
      </form>
    </div>
  );
}
