import { getCached, setCached } from "@/lib/wiki/search-cache";

const FORUM_PREVIEW_CACHE_KEY = "forum:latest-preview";
const DEFAULT_FORUM_BASE_URL = "https://chat.nanyee.de";
const AUTHOR_COLORS = ["#E8652B", "#457B9D", "#4CAF50", "#9B59B6", "#E74C3C", "#27ae60", "#2196F3"];

export interface ForumPreviewItem {
  id: string;
  title: string;
  href: string;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  replyCount: number;
  lastPostedAt: string | null;
}

function getForumBaseUrl(): string {
  return process.env.NEXT_PUBLIC_FORUM_URL || DEFAULT_FORUM_BASE_URL;
}

function getAuthorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

function normalizeForumPreviewItem(item: unknown, forumBaseUrl: string): ForumPreviewItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const discussion = item as {
    id?: string;
    attributes?: {
      title?: string;
      slug?: string;
      commentCount?: number;
      lastPostedAt?: string | null;
    };
    relationships?: {
      user?: {
        data?: {
          attributes?: {
            displayName?: string;
            username?: string;
          };
        };
      };
    };
  };

  const id = discussion.id;
  const title = discussion.attributes?.title?.trim();

  if (!id || !title) {
    return null;
  }

  const authorName =
    discussion.relationships?.user?.data?.attributes?.displayName
    || discussion.relationships?.user?.data?.attributes?.username
    || "匿名";

  const slug = discussion.attributes?.slug?.trim() || id;
  const replyCount = Math.max(0, Number(discussion.attributes?.commentCount ?? 0));

  return {
    id,
    title,
    href: `${forumBaseUrl}/d/${id}-${slug}`,
    authorName,
    authorInitial: authorName.charAt(0) || "?",
    authorColor: getAuthorColor(authorName),
    replyCount,
    lastPostedAt: discussion.attributes?.lastPostedAt ?? null,
  };
}

export async function getLatestForumPosts(limit = 4): Promise<ForumPreviewItem[]> {
  const cacheKey = `${FORUM_PREVIEW_CACHE_KEY}:${limit}`;
  const cached = getCached<ForumPreviewItem[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const forumBaseUrl = getForumBaseUrl();
  const response = await fetch(
    `${forumBaseUrl}/api/discussions?sort=-lastPostedAt&page%5Blimit%5D=${limit}`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    },
  );

  if (!response.ok) {
    throw new Error(`Forum preview fetch failed with status ${response.status}`);
  }

  const payload = await response.json() as { data?: unknown[] };
  const posts = (payload.data ?? [])
    .map((item) => normalizeForumPreviewItem(item, forumBaseUrl))
    .filter((item): item is ForumPreviewItem => item !== null);

  setCached(cacheKey, posts);
  return posts;
}
