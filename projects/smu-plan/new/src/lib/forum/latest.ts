import { getCached, setCached } from "@/lib/wiki/search-cache";

const FORUM_PREVIEW_CACHE_KEY = "forum:latest-preview";
const DEFAULT_FORUM_BASE_URL = "https://chat.nanyee.de";
const DEFAULT_FORUM_INTERNAL_BASE_URL = "http://127.0.0.1:8890";
const AUTHOR_COLORS = ["#E8652B", "#457B9D", "#4CAF50", "#9B59B6", "#E74C3C", "#27ae60", "#2196F3"];

interface ForumUserAttributes {
  displayName?: string;
  username?: string;
}

interface ForumRelationshipRef {
  id?: string;
  type?: string;
}

interface ForumDiscussionResource {
  id?: string;
  type?: string;
  attributes?: {
    title?: string;
    slug?: string;
    commentCount?: number;
    lastPostedAt?: string | null;
  };
  relationships?: {
    user?: { data?: ForumRelationshipRef | null };
    lastPostedUser?: { data?: ForumRelationshipRef | null };
  };
}

interface ForumIncludedResource {
  id?: string;
  type?: string;
  attributes?: ForumUserAttributes;
}

interface ForumDiscussionsPayload {
  data?: ForumDiscussionResource[];
  included?: ForumIncludedResource[];
}

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

export function getForumBaseUrl(): string {
  return process.env.NEXT_PUBLIC_FORUM_URL || DEFAULT_FORUM_BASE_URL;
}

function getForumFetchBaseUrl(): string {
  if (process.env.FORUM_INTERNAL_BASE_URL) {
    return process.env.FORUM_INTERNAL_BASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    return DEFAULT_FORUM_INTERNAL_BASE_URL;
  }

  return getForumBaseUrl();
}

function getAuthorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

function resolveIncludedUser(
  relation: ForumRelationshipRef | null | undefined,
  includedMap: Map<string, ForumUserAttributes>,
): ForumUserAttributes | null {
  if (!relation?.id || !relation.type) {
    return null;
  }

  return includedMap.get(`${relation.type}:${relation.id}`) ?? null;
}

function resolveDiscussionHref(
  forumBaseUrl: string,
  discussionId: string,
  slug: string | undefined,
) {
  const trimmedSlug = slug?.trim();
  const discussionPath = trimmedSlug
    ? (trimmedSlug.startsWith(`${discussionId}-`) ? trimmedSlug : `${discussionId}-${trimmedSlug}`)
    : discussionId;

  return `${forumBaseUrl}/d/${discussionPath}`;
}

export function normalizeForumPreviewItems(
  payload: ForumDiscussionsPayload,
  forumBaseUrl: string,
): ForumPreviewItem[] {
  const includedMap = new Map<string, ForumUserAttributes>();

  for (const item of payload.included ?? []) {
    if (!item.id || !item.type || !item.attributes) {
      continue;
    }
    includedMap.set(`${item.type}:${item.id}`, item.attributes);
  }

  return (payload.data ?? [])
    .map((discussion) => {
      const id = discussion.id;
      const title = discussion.attributes?.title?.trim();

      if (!id || !title) {
        return null;
      }

      const authorAttributes =
        resolveIncludedUser(discussion.relationships?.lastPostedUser?.data, includedMap)
        ?? resolveIncludedUser(discussion.relationships?.user?.data, includedMap);

      const authorName =
        authorAttributes?.displayName?.trim()
        || authorAttributes?.username?.trim()
        || "匿名";

      const replyCount = Math.max(0, Number(discussion.attributes?.commentCount ?? 0));

      return {
        id,
        title,
        href: resolveDiscussionHref(forumBaseUrl, id, discussion.attributes?.slug),
        authorName,
        authorInitial: authorName.charAt(0) || "?",
        authorColor: getAuthorColor(authorName),
        replyCount,
        lastPostedAt: discussion.attributes?.lastPostedAt ?? null,
      };
    })
    .filter((item): item is ForumPreviewItem => item !== null);
}

export async function getLatestForumPosts(limit = 4): Promise<ForumPreviewItem[]> {
  const cacheKey = `${FORUM_PREVIEW_CACHE_KEY}:${limit}`;
  const cached = getCached<ForumPreviewItem[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const forumBaseUrl = getForumBaseUrl();
  const forumFetchBaseUrl = getForumFetchBaseUrl();
  const response = await fetch(
    `${forumFetchBaseUrl}/api/discussions?sort=-lastPostedAt&page%5Blimit%5D=${limit}&include=user,lastPostedUser`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    },
  );

  if (!response.ok) {
    throw new Error(`Forum preview fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ForumDiscussionsPayload;
  const posts = normalizeForumPreviewItems(payload, forumBaseUrl);

  setCached(cacheKey, posts);
  return posts;
}
