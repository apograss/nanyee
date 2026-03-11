import slugify from "slugify";

import { prisma } from "@/lib/prisma";

const FALLBACK_CATEGORY_SLUG = "wiki-category";
const LEGACY_PARENT_SLUG = "legacy-import";
const LEGACY_PARENT_NAME = "历史导入";
const LEGACY_PARENT_ICON = "🗂️";

export interface WikiCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  articleCount: number;
  children: WikiCategoryNode[];
}

export interface WikiCategorySummary {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
}

export interface ResolvedWikiCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  parentName: string | null;
  parentSlug: string | null;
  parentIcon: string | null;
}

export type WikiCategoryAction = "create" | "update" | "delete" | "reorder";

export function slugifyWikiCategoryName(name: string): string {
  const normalized = slugify(name, {
    lower: true,
    strict: true,
    locale: "zh",
    trim: true,
  });
  if (normalized) {
    return normalized;
  }

  const unicodeSlug = Array.from(name.trim())
    .map((char) => `u${char.codePointAt(0)?.toString(16) ?? ""}`)
    .join("-");

  return unicodeSlug || FALLBACK_CATEGORY_SLUG;
}

export function canWriteWikiCategory(
  input: { role: string; parentId: string | null },
  action: WikiCategoryAction,
): boolean {
  if (input.role === "admin") {
    return true;
  }

  if (!input.parentId) {
    return false;
  }

  return action === "create" || action === "update";
}

async function ensureUniqueWikiCategorySlug(
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  let candidate = baseSlug || FALLBACK_CATEGORY_SLUG;
  let suffix = 1;

  for (;;) {
    const existing = await prisma.wikiCategory.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${baseSlug || FALLBACK_CATEGORY_SLUG}-${suffix}`;
  }
}

export async function buildUniqueWikiCategorySlug(
  name: string,
  excludeId?: string,
): Promise<string> {
  return ensureUniqueWikiCategorySlug(slugifyWikiCategoryName(name), excludeId);
}

export async function ensureLegacyWikiCategories(): Promise<void> {
  const legacyRows = await prisma.article.findMany({
    where: {
      categoryId: null,
      category: { not: null },
    },
    select: {
      id: true,
      category: true,
    },
  });

  const legacyCategories = [...new Set(
    legacyRows
      .map((row) => row.category?.trim())
      .filter((value): value is string => Boolean(value)),
  )];

  if (legacyCategories.length === 0) {
    return;
  }

  const parent = await prisma.wikiCategory.upsert({
    where: { slug: LEGACY_PARENT_SLUG },
    update: { icon: LEGACY_PARENT_ICON, name: LEGACY_PARENT_NAME },
    create: {
      name: LEGACY_PARENT_NAME,
      slug: LEGACY_PARENT_SLUG,
      icon: LEGACY_PARENT_ICON,
      sortOrder: 999,
    },
    select: { id: true },
  });

  const existingChildren = await prisma.wikiCategory.findMany({
    where: { parentId: parent.id },
    select: { id: true, name: true },
  });
  const existingMap = new Map(existingChildren.map((item) => [item.name, item.id]));

  for (const [index, categoryName] of legacyCategories.entries()) {
    let childId = existingMap.get(categoryName);

    if (!childId) {
      const slug = await buildUniqueWikiCategorySlug(categoryName);
      const created = await prisma.wikiCategory.create({
        data: {
          name: categoryName,
          slug,
          parentId: parent.id,
          sortOrder: index,
        },
        select: { id: true },
      });
      childId = created.id;
      existingMap.set(categoryName, childId);
    }

    await prisma.article.updateMany({
      where: {
        categoryId: null,
        category: categoryName,
      },
      data: {
        categoryId: childId,
      },
    });
  }
}

export async function listWikiCategoryTree(): Promise<WikiCategoryNode[]> {
  await ensureLegacyWikiCategories();

  const [categories, articleCounts] = await Promise.all([
    prisma.wikiCategory.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        sortOrder: true,
      },
    }),
    prisma.article.groupBy({
      by: ["categoryId"],
      where: {
        status: "published",
        categoryId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map(
    articleCounts
      .filter((row) => row.categoryId)
      .map((row) => [row.categoryId as string, row._count._all]),
  );

  const nodes = new Map<string, WikiCategoryNode>();
  for (const category of categories) {
    nodes.set(category.id, {
      ...category,
      articleCount: countMap.get(category.id) ?? 0,
      children: [],
    });
  }

  const roots: WikiCategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: WikiCategoryNode[]) => {
    items.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name, "zh-CN");
    });
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);

  for (const root of roots) {
    root.articleCount += root.children.reduce(
      (sum, child) => sum + child.articleCount,
      0,
    );
  }

  return roots;
}

export async function listWikiParentCategories(): Promise<WikiCategorySummary[]> {
  const tree = await listWikiCategoryTree();
  return tree.map(({ children, articleCount, ...item }) => item);
}

export async function resolveWikiCategorySelection(input: {
  categoryId?: string | null;
  category?: string | null;
}): Promise<ResolvedWikiCategory | null> {
  if (input.categoryId) {
    const category = await prisma.wikiCategory.findUnique({
      where: { id: input.categoryId },
      include: {
        parent: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    if (!category) {
      return null;
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      parentId: category.parentId,
      parentName: category.parent?.name ?? null,
      parentSlug: category.parent?.slug ?? null,
      parentIcon: category.parent?.icon ?? null,
    };
  }

  const trimmed = input.category?.trim();
  if (!trimmed) {
    return null;
  }

  const category = await prisma.wikiCategory.findFirst({
    where: {
      OR: [{ name: trimmed }, { slug: trimmed }],
    },
    include: {
      parent: {
        select: { id: true, name: true, slug: true, icon: true },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    parentId: category.parentId,
    parentName: category.parent?.name ?? null,
    parentSlug: category.parent?.slug ?? null,
    parentIcon: category.parent?.icon ?? null,
  };
}
