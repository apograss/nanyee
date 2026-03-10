import { prisma } from "@/lib/prisma";

/**
 * Resolve an article by slug or id.
 * Callers are responsible for checking article.status.
 */
export async function resolveArticle(slugOrId: string) {
  const article =
    (await prisma.article.findUnique({ where: { slug: slugOrId } })) ??
    (await prisma.article.findUnique({ where: { id: slugOrId } }));
  return article;
}
