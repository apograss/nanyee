"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

interface Topic {
  id: string;
  title: string;
  category: string;
  pinned: boolean;
  locked: boolean;
  viewCount: number;
  replyCount: number;
  lastReplyAt: string | null;
  createdAt: string;
  author: { id: string; username: string; nickname: string | null };
}

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "general", label: "综合" },
  { value: "study", label: "学习" },
  { value: "life", label: "生活" },
  { value: "trade", label: "交易" },
  { value: "question", label: "提问" },
];

export default function BBSPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category") || "";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.user) setUser(data.data.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({
      page: currentPage.toString(),
      limit: "20",
    });
    if (currentCategory) query.append("category", currentCategory);

    fetch(`/api/bbs/topics?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setTopics(data.data.items);
          setTotalPages(data.data.pagination.totalPages);
        }
      })
      .finally(() => setLoading(false));
  }, [currentCategory, currentPage]);

  const handleCategoryChange = (cat: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (cat) params.set("category", cat);
    else params.delete("category");
    params.set("page", "1");
    router.push(`/bbs?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`/bbs?${params.toString()}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>社区论坛</h1>
          <p className={styles.subtitle}>交流学习经验，分享校园生活</p>
        </div>
        <div>
          {user ? (
            <Link href="/bbs/new">
              <NeoButton variant="primary" size="md">发表新帖</NeoButton>
            </Link>
          ) : (
            <Link href="/login?redirect=/bbs">
              <NeoButton variant="secondary" size="md">登录发帖</NeoButton>
            </Link>
          )}
        </div>
      </header>

      <div className={styles.filters}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`${styles.filterBtn} ${
              currentCategory === cat.value ? styles.active : ""
            }`}
            onClick={() => handleCategoryChange(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {loading ? (
          <div className={styles.empty}>加载中...</div>
        ) : topics.length === 0 ? (
          <div className={styles.empty}>暂无帖子</div>
        ) : (
          topics.map((topic) => (
            <Link href={`/bbs/${topic.id}`} key={topic.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardHeader}>
                  <span className={styles.categoryBadge}>
                    {CATEGORIES.find((c) => c.value === topic.category)?.label || topic.category}
                  </span>
                  {topic.pinned && <span className={styles.pinnedBadge}>置顶</span>}
                  {topic.locked && <span className={styles.lockedBadge}>锁定</span>}
                </div>
                <h2 className={styles.cardTitle}>{topic.title}</h2>
                <div className={styles.cardMeta}>
                  <span>{topic.author.nickname || topic.author.username}</span>
                  <span>&middot;</span>
                  <span>{new Date(topic.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className={styles.cardStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>回复</span>
                  <span className={styles.statValue}>{topic.replyCount}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>浏览</span>
                  <span className={styles.statValue}>{topic.viewCount}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <NeoButton
            variant="secondary"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            上一页
          </NeoButton>
          <span className={styles.pageInfo}>
            {currentPage} / {totalPages}
          </span>
          <NeoButton
            variant="secondary"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            下一页
          </NeoButton>
        </div>
      )}
    </div>
  );
}
