"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "./page.module.css";

const CATEGORIES = [
  { value: "general", label: "综合" },
  { value: "study", label: "学习" },
  { value: "life", label: "生活" },
  { value: "trade", label: "交易" },
  { value: "question", label: "提问" },
];

export default function NewTopicPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok || !data.data?.user) {
          router.replace("/login?redirect=/bbs/new");
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("标题和内容不能为空");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/bbs/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, content }),
      });
      const data = await res.json();

      if (data.ok) {
        router.push(`/bbs/${data.data.topic.id}`);
      } else {
        setError(data.error?.message || "发帖失败");
        setSubmitting(false);
      }
    } catch {
      setError("网络错误，请检查网络连接");
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>发布新帖</h1>
        <button className={styles.backBtn} onClick={() => router.back()}>
          取消并返回
        </button>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.formGroup}>
          <label htmlFor="bbs-category" className={styles.label}>分类板块</label>
          <select
            id="bbs-category"
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <NeoInput
            label="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="用简短的话概括你要讨论的内容"
            maxLength={200}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="bbs-content" className={styles.label}>正文内容</label>
          <textarea
            id="bbs-content"
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="详细描述你的问题或分享的内容..."
            rows={12}
            required
          />
        </div>

        <div className={styles.actions}>
          <NeoButton type="submit" variant="primary" size="lg" isLoading={submitting}>
            发布帖子
          </NeoButton>
        </div>
      </form>
    </div>
  );
}
