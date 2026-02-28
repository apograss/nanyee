"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

export default function EditorPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

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
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>投稿</h1>
      <p className={styles.desc}>分享你的校园经验与知识</p>

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
          提交审核
        </NeoButton>
      </form>
    </div>
  );
}
