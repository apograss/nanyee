import { Suspense } from "react";
import { prisma } from "@/lib/prisma";

import ArticleList from "@/components/organisms/ArticleList";

import {
  KB_HERO,
  KB_LIST_SECTION,
} from "./config";
import WikiCreateButton from "./WikiCreateButton";
import KBSearchBar from "./KBSearchBar";
import styles from "./page.module.css";

export const revalidate = 60;

export default async function KBPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const where = {
    status: "published" as const,
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { summary: { contains: q } },
            { tags: { contains: q } },
          ],
        }
      : {}),
  };

  const [articles, totalArticles] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [
        { isPinned: "desc" },
        { pinnedAt: "desc" },
        { publishedAt: "desc" },
      ],
      take: 20,
      include: { author: { select: { username: true, nickname: true } } },
    }),
    prisma.article.count({ where: { status: "published" } }),
  ]);

  const data = articles.map((article) => ({
    id: article.slug,
    title: article.title,
    excerpt: article.summary,
    date: (article.publishedAt || article.createdAt).toISOString(),
    tags: article.tags ? JSON.parse(article.tags) : [],
    authorName: article.author.nickname || article.author.username,
    viewCount: article.viewCount,
    isPinned: article.isPinned,
  }));

  return (
    <div className={styles.page}>
      {/* ── Compact Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroIntro}>
            <p className={styles.kicker}>{KB_HERO.kicker}</p>
            <h1 className={styles.title}>{KB_HERO.title}</h1>
            <p className={styles.desc}>{KB_HERO.description}</p>
          </div>
          <div className={styles.heroMeta}>
            <div className={styles.statBadge}>
              <strong className={styles.statValue}>{totalArticles}</strong>
              <span className={styles.statLabel}>{KB_HERO.statLabel}</span>
            </div>
            <WikiCreateButton />
          </div>
        </div>

        <Suspense>
          <KBSearchBar />
        </Suspense>
      </section>

      {/* ── Feature Cards ── */}
      <section className={styles.featureGrid}>
        {KB_HERO.panelItems.map((item, index) => (
          <article key={item.title} className={styles.featureCard} style={{ animationDelay: `${0.15 + index * 0.08}s` }}>
            <span className={styles.featureIcon}>{item.icon}</span>
            <h3 className={styles.featureTitle}>{item.title}</h3>
            <p className={styles.featureDesc}>{item.description}</p>
          </article>
        ))}
      </section>

      {/* ── Article List ── */}
      <section id="kb-latest" className={styles.listSection}>
        <div className={styles.listHeader}>
          <div>
            <p className={styles.listKicker}>
              {q ? `搜索结果 · "${q}"` : KB_LIST_SECTION.kicker}
            </p>
            <h2 className={styles.listTitle}>
              {q
                ? `找到 ${data.length} 条相关内容`
                : KB_LIST_SECTION.title}
            </h2>
          </div>
          <p className={styles.listHint}>{KB_LIST_SECTION.hint}</p>
        </div>
        <ArticleList articles={data} />
      </section>
    </div>
  );
}
