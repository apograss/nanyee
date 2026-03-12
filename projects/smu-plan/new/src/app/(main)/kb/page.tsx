import { Suspense } from "react";

import ArticleList from "@/components/organisms/ArticleList";
import {
  getArticleMeta,
  getKBStats,
  getWikiLeaderboard,
  listArticles,
  type SortMode,
} from "@/lib/wiki/queries";

import KBHeroBanner from "./KBHeroBanner";
import KBSidebar from "./KBSidebar";
import KBSortBar from "./KBSortBar";
import styles from "./page.module.css";

export const revalidate = 60;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function KBPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    category?: string;
    tag?: string;
  }>;
}) {
  const { q, sort, category, tag } = await searchParams;
  const sortMode = (["newest", "popular", "recommended"].includes(sort ?? "")
    ? sort
    : "newest") as SortMode;
  const showLeaderboard = !q && !category && !tag;

  const [result, meta, stats, leaderboard] = await Promise.all([
    listArticles({ q, sort: sortMode, category, tag, page: 1, limit: 20 }),
    getArticleMeta(),
    getKBStats(),
    showLeaderboard ? getWikiLeaderboard() : Promise.resolve(null),
  ]);

  const now = Date.now();
  const data = result.articles.map((article) => ({
    id: article.slug,
    title: article.title,
    excerpt: article.summary,
    date: article.publishedAt || article.createdAt,
    categoryName: article.category,
    categoryIcon: article.categoryIcon,
    parentCategoryName: article.categoryParentName,
    parentCategoryIcon: article.categoryParentIcon,
    tags: article.tags,
    authorName: article.authorName,
    authorAvatar: article.authorAvatar,
    viewCount: article.viewCount,
    isPinned: article.isPinned,
    isNew: article.createdAt
      ? now - new Date(article.createdAt).getTime() < SEVEN_DAYS_MS
      : false,
  }));

  const headingLabel = q
    ? `搜索 “${q}”`
    : category
      ? category
      : tag
        ? `#${tag}`
        : "全部文章";

  return (
    <div className={styles.layout}>
      <Suspense>
        <KBSidebar meta={meta} currentCategory={category} currentTag={tag} />
      </Suspense>

      <main className={styles.main}>
        <KBHeroBanner stats={stats} />

        <div className={styles.contentArea}>
          <section className={styles.primaryColumn}>
            <div className={styles.sortRow}>
              <div className={styles.sortInfo}>
                {headingLabel}
                <span className={styles.sortInfoCount}>· {data.length} 篇</span>
              </div>
              <Suspense>
                <KBSortBar currentSort={sortMode} />
              </Suspense>
            </div>

            <ArticleList articles={data} />
          </section>

          {showLeaderboard ? (
            <aside className={styles.insights}>
              <section className={styles.insightCard}>
                <h2 className={styles.insightTitle}>本周热门</h2>
                <div className={styles.insightList}>
                  {leaderboard?.hotArticles.map((article, index) => (
                    <a key={article.slug} href={`/kb/${article.slug}`} className={styles.insightItem}>
                      <span className={styles.insightIndex}>{index + 1}</span>
                      <span aria-hidden="true" />
                      <span className={styles.insightText}>{article.title}</span>
                      <span className={styles.insightMeta}>{article.viewCount}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section className={styles.insightCard}>
                <h2 className={styles.insightTitle}>贡献者排行</h2>
                <div className={styles.insightList}>
                  {leaderboard?.contributors.map((contributor, index) => (
                    <div key={contributor.id} className={styles.insightItem}>
                      <span className={styles.insightIndex}>{index + 1}</span>
                      <span className={styles.contributorAvatar}>
                        {contributor.avatar ? (
                          <img src={contributor.avatar} alt={contributor.name} />
                        ) : (
                          contributor.name.charAt(0)
                        )}
                      </span>
                      <span className={styles.insightText}>{contributor.name}</span>
                      <span className={styles.insightMeta}>{contributor.editCount}</span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
