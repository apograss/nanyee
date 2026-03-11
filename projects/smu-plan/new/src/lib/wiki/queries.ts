/**
 * Shared wiki query layer.
 * Used by API routes AND Server Components — never fetch your own API.
 */

import { prisma } from "@/lib/prisma";
import { presentPublicUser } from "@/lib/user-presenter";
import { getLatestForumPosts, type ForumPreviewItem } from "@/lib/forum/latest";
import { searchWikiArticles } from "./search";
import { getCached, setCached } from "./search-cache";
import {
  listWikiCategoryTree,
  resolveWikiCategorySelection,
  type WikiCategoryNode,
} from "./categories";

// ─── Types ───────────────────────────────────────────────────

export type SortMode = "newest" | "popular" | "recommended";

export interface ListArticlesParams {
  page?: number;
  limit?: number;
  sort?: SortMode;
  category?: string;
  tag?: string;
  q?: string;
}

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  categoryId: string | null;
  category: string | null;
  categorySlug: string | null;
  categoryIcon: string | null;
  categoryParentName: string | null;
  categoryParentSlug: string | null;
  categoryParentIcon: string | null;
  tags: string[];
  viewCount: number;
  isPinned: boolean;
  authorName: string;
  authorAvatar: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface ListArticlesResult {
  articles: ArticleListItem[];
  pagination: { page: number; limit: number; total: number };
}

export interface CategoryCount {
  name: string;
  count: number;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface ContributorInfo {
  id: string;
  name: string;
  avatar: string | null;
}

export interface ArticleMeta {
  categories: CategoryCount[];
  categoryTree: WikiCategoryNode[];
  tags: TagCount[];
  contributors: ContributorInfo[];
}

export interface KBStats {
  totalArticles: number;
  totalContributors: number;
  weeklyNew: number;
}

// ─── Helpers ─────────────────────────────────────────────────

const AUTHOR_SELECT = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
  status: true,
} as const;

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function toListItem(a: {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  categoryId: string | null;
  category: string | null;
  categoryRef: {
    id: string;
    slug: string;
    icon: string | null;
    parent: {
      name: string;
      slug: string;
      icon: string | null;
    } | null;
  } | null;
  tags: string | null;
  viewCount: number;
  isPinned: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  author: { id: string; username: string; nickname: string | null; avatarUrl: string | null; status: string };
}): ArticleListItem {
  const pub = presentPublicUser(a.author);
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    categoryId: a.categoryId,
    category: a.category,
    categorySlug: a.categoryRef?.slug ?? null,
    categoryIcon: a.categoryRef?.icon ?? null,
    categoryParentName: a.categoryRef?.parent?.name ?? null,
    categoryParentSlug: a.categoryRef?.parent?.slug ?? null,
    categoryParentIcon: a.categoryRef?.parent?.icon ?? null,
    tags: parseTags(a.tags),
    viewCount: a.viewCount,
    isPinned: a.isPinned,
    authorName: pub.displayName,
    authorAvatar: pub.avatarUrl,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

const SORT_ORDER: Record<SortMode, { orderBy: Record<string, string>[] }> = {
  newest: { orderBy: [{ publishedAt: "desc" }] },
  popular: { orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }] },
  recommended: {
    orderBy: [
      { isPinned: "desc" },
      { pinnedAt: "desc" },
      { viewCount: "desc" },
      { publishedAt: "desc" },
    ],
  },
};

// ─── listArticles ────────────────────────────────────────────

export async function listArticles(
  params: ListArticlesParams = {},
): Promise<ListArticlesResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const sort: SortMode = params.sort ?? "newest";
  const where: Record<string, unknown> = { status: "published" };

  if (params.category) {
    const resolvedCategory = await resolveWikiCategorySelection({
      category: params.category,
    });
    if (resolvedCategory) {
      where.categoryId = resolvedCategory.id;
    } else {
      where.category = params.category;
    }
  }

  // FTS search path
  if (params.q) {
    const { results: ftsResults, total } = await searchWikiArticles(
      params.q,
      limit,
      (page - 1) * limit,
    );
    const ids = ftsResults.map((r) => r.id);
    if (ids.length === 0) {
      return { articles: [], pagination: { page, limit, total: 0 } };
    }

    const articles = await prisma.article.findMany({
      where: { id: { in: ids }, status: "published" },
      include: {
        author: { select: AUTHOR_SELECT },
        categoryRef: {
          select: {
            id: true,
            slug: true,
            icon: true,
            parent: { select: { name: true, slug: true, icon: true } },
          },
        },
      },
    });

    // Preserve FTS ranking
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    articles.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

    let mapped = articles.map(toListItem);

    // Post-filter by tag if specified
    if (params.tag) {
      mapped = mapped.filter((a) => a.tags.includes(params.tag!));
    }

    return { articles: mapped, pagination: { page, limit, total } };
  }

  // Non-search path
  const { orderBy } = SORT_ORDER[sort];

  // If filtering by tag we need to fetch more and filter in-app
  if (params.tag) {
    const allArticles = await prisma.article.findMany({
      where,
      orderBy,
      include: {
        author: { select: AUTHOR_SELECT },
        categoryRef: {
          select: {
            id: true,
            slug: true,
            icon: true,
            parent: { select: { name: true, slug: true, icon: true } },
          },
        },
      },
    });

    const filtered = allArticles
      .filter((a) => parseTags(a.tags).includes(params.tag!))
      .map(toListItem);

    const total = filtered.length;
    const paged = filtered.slice((page - 1) * limit, page * limit);

    return { articles: paged, pagination: { page, limit, total } };
  }

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: AUTHOR_SELECT },
        categoryRef: {
          select: {
            id: true,
            slug: true,
            icon: true,
            parent: { select: { name: true, slug: true, icon: true } },
          },
        },
      },
    }),
    prisma.article.count({ where }),
  ]);

  return {
    articles: articles.map(toListItem),
    pagination: { page, limit, total },
  };
}

// ─── getArticleMeta ─────────────────────────────────────────

const META_CACHE_KEY = "wiki:meta";
const META_TTL_MS = 60_000; // 60s

export async function getArticleMeta(
  topTags = 30,
  topContributors = 8,
): Promise<ArticleMeta> {
  const cached = getCached<ArticleMeta>(META_CACHE_KEY);
  if (cached) return cached;

  const categoryTree = await listWikiCategoryTree();
  const categories: CategoryCount[] = categoryTree.flatMap((parent) => {
    if (parent.children.length === 0) {
      return [{ name: parent.name, count: parent.articleCount }];
    }

    return parent.children.map((child) => ({
      name: child.name,
      count: child.articleCount,
    }));
  });

  // Tags: fetch all published articles' tags, parse & aggregate
  const tagRows = await prisma.article.findMany({
    where: { status: "published", tags: { not: null } },
    select: { tags: true },
  });
  const tagMap = new Map<string, number>();
  for (const row of tagRows) {
    for (const t of parseTags(row.tags)) {
      tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
    }
  }
  const tags: TagCount[] = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topTags)
    .map(([name, count]) => ({ name, count }));

  // Contributors: union of article authors + revision editors
  const contributorRows = await prisma.$queryRawUnsafe<
    { userId: string; cnt: number }[]
  >(
    `SELECT userId, SUM(cnt) as cnt FROM (
       SELECT authorId as userId, COUNT(*) as cnt FROM Article
       WHERE status = 'published' GROUP BY authorId
       UNION ALL
       SELECT editorId as userId, COUNT(*) as cnt FROM ArticleRevision
       GROUP BY editorId
     ) GROUP BY userId ORDER BY cnt DESC LIMIT ?`,
    topContributors,
  );

  const userIds = contributorRows.map((r) => r.userId);
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, status: "active" },
          select: AUTHOR_SELECT,
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const contributors: ContributorInfo[] = contributorRows
    .map((r) => {
      const u = userMap.get(r.userId);
      if (!u) return null;
      const pub = presentPublicUser(u);
      return { id: pub.id, name: pub.displayName, avatar: pub.avatarUrl };
    })
    .filter((c): c is ContributorInfo => c !== null);

  const meta: ArticleMeta = { categories, categoryTree, tags, contributors };
  setCached(META_CACHE_KEY, meta);
  return meta;
}

// ─── getKBStats ─────────────────────────────────────────────

const STATS_CACHE_KEY = "wiki:stats";

export async function getKBStats(): Promise<KBStats> {
  const cached = getCached<KBStats>(STATS_CACHE_KEY);
  if (cached) return cached;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalArticles, weeklyNew, contributorRows] = await Promise.all([
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({
      where: { status: "published", createdAt: { gte: oneWeekAgo } },
    }),
    prisma.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(DISTINCT userId) as cnt FROM (
         SELECT authorId as userId FROM Article WHERE status = 'published'
         UNION
         SELECT editorId as userId FROM ArticleRevision
       )`,
    ),
  ]);

  const stats: KBStats = {
    totalArticles,
    totalContributors: Number(contributorRows[0]?.cnt ?? 0),
    weeklyNew,
  };

  setCached(STATS_CACHE_KEY, stats);
  return stats;
}

// ─── getHomePreview ─────────────────────────────────────────

export interface HomePreview {
  latestArticles: {
    title: string;
    slug: string;
    summary: string | null;
    authorName: string;
    publishedAt: string | null;
  }[];
  latestForumPosts: ForumPreviewItem[];
  kbStats: { totalArticles: number; weeklyNew: number };
}

const HOME_CACHE_KEY = "wiki:home-preview";

export async function getHomePreview(): Promise<HomePreview> {
  const cached = getCached<HomePreview>(HOME_CACHE_KEY);
  if (cached) return cached;

  const [articles, stats] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 3,
      include: { author: { select: AUTHOR_SELECT } },
    }),
    getKBStats(),
  ]);

  let latestForumPosts: ForumPreviewItem[] = [];
  let shouldCache = true;

  try {
    latestForumPosts = await getLatestForumPosts();
  } catch {
    shouldCache = false;
  }

  const preview: HomePreview = {
    latestArticles: articles.map((a) => ({
      title: a.title,
      slug: a.slug,
      summary: a.summary,
      authorName: presentPublicUser(a.author).displayName,
      publishedAt: a.publishedAt?.toISOString() ?? null,
    })),
    latestForumPosts,
    kbStats: {
      totalArticles: stats.totalArticles,
      weeklyNew: stats.weeklyNew,
    },
  };

  if (shouldCache || latestForumPosts.length > 0) {
    setCached(HOME_CACHE_KEY, preview);
  }

  return preview;
}
