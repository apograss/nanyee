"use client";

import { useEffect, useState } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import Badge from "@/components/atoms/Badge";
import styles from "./page.module.css";

interface PendingArticle {
  id: string;
  title: string;
  authorName: string;
  createdAt: string;
}

export default function AuditPage() {
  const [articles, setArticles] = useState<PendingArticle[]>([]);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setArticles(data.data.articles);
      })
      .catch(() => {});
  }, []);

  const handleAction = async (id: string, action: "publish" | "reject") => {
    const res = await fetch(`/api/wiki/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    // The action is determined by URL path, but since we use the same route,
    // we'll call the admin-specific endpoint instead
    const adminRes = await fetch(`/api/admin/audit/${id}/${action}`, {
      method: "POST",
    });
    const data = await adminRes.json();
    if (data.ok) {
      setArticles((prev) => prev.filter((a) => a.id !== id));
    }
  };

  return (
    <div>
      <h1 className={styles.title}>文章审核</h1>

      {articles.length === 0 && (
        <p className={styles.empty}>没有待审核的文章</p>
      )}

      <div className={styles.list}>
        {articles.map((article) => (
          <div key={article.id} className={styles.item}>
            <div className={styles.itemInfo}>
              <h3 className={styles.itemTitle}>{article.title}</h3>
              <div className={styles.itemMeta}>
                <span>{article.authorName}</span>
                <span>{new Date(article.createdAt).toLocaleDateString("zh-CN")}</span>
                <Badge text="待审核" colorVariant="warning" />
              </div>
            </div>
            <div className={styles.itemActions}>
              <NeoButton
                size="sm"
                variant="primary"
                onClick={() => handleAction(article.id, "publish")}
              >
                通过
              </NeoButton>
              <NeoButton
                size="sm"
                variant="danger"
                onClick={() => handleAction(article.id, "reject")}
              >
                拒绝
              </NeoButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
