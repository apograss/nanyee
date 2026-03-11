import { Suspense } from "react";
import {
  listArticles,
  getArticleMeta,
  getKBStats,
  type SortMode,
} from "@/lib/wiki/queries";
import ArticleList from "@/components/organisms/ArticleList";
import KBSidebar from "./KBSidebar";
import KBHeroBanner from "./KBHeroBanner";
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

  const [result, meta, stats] = await Promise.all([
    listArticles({ q, sort: sortMode, category, tag, page: 1, limit: 20 }),
    getArticleMeta(),
    getKBStats(),
  ]);

  const now = Date.now();
  const data = result.articles.map((a) => ({
    id: a.slug,
    title: a.title,
    excerpt: a.summary,
    date: a.publishedAt || a.createdAt,
    categoryName: a.category,
    categoryIcon: a.categoryIcon,
    parentCategoryName: a.categoryParentName,
    parentCategoryIcon: a.categoryParentIcon,
    tags: a.tags,
    authorName: a.authorName,
    authorAvatar: a.authorAvatar,
    viewCount: a.viewCount,
    isPinned: a.isPinned,
    isNew: a.createdAt
      ? now - new Date(a.createdAt).getTime() < SEVEN_DAYS_MS
      : false,
  }));

  // Build heading for sort info
  const headingLabel = q
    ? `搜索 "${q}"`
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
      </main>
    </div>
  );
}
