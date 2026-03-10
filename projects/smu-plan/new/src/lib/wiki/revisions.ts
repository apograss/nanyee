/**
 * ArticleRevision helpers.
 */

import { prisma } from "@/lib/prisma";

interface CreateRevisionInput {
  articleId: string;
  title: string;
  content: string;
  format: string;
  summary: string | null;
  editorId: string;
  editSummary?: string;
}

/** Create a revision snapshot of the current article state. */
export async function createRevision(input: CreateRevisionInput) {
  return prisma.articleRevision.create({
    data: {
      articleId: input.articleId,
      title: input.title,
      content: input.content,
      format: input.format,
      summary: input.summary,
      editorId: input.editorId,
      editSummary: input.editSummary,
    },
  });
}

/** List revisions for an article (newest first). */
export async function listRevisions(
  articleId: string,
  page = 1,
  limit = 20,
) {
  const [revisions, total] = await Promise.all([
    prisma.articleRevision.findMany({
      where: { articleId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        editor: { select: { username: true, nickname: true } },
      },
    }),
    prisma.articleRevision.count({ where: { articleId } }),
  ]);

  return { revisions, total };
}

/** Revert an article to a specific revision. Creates a pre-revert snapshot first. */
export async function revertToRevision(
  articleId: string,
  revisionId: string,
  adminId: string,
) {
  const [article, revision] = await Promise.all([
    prisma.article.findUnique({ where: { id: articleId } }),
    prisma.articleRevision.findUnique({ where: { id: revisionId } }),
  ]);

  if (!article) throw new Error("Article not found");
  if (!revision || revision.articleId !== articleId) {
    throw new Error("Revision not found");
  }

  // Create pre-revert snapshot
  await createRevision({
    articleId,
    title: article.title,
    content: article.content,
    format: article.format,
    summary: article.summary,
    editorId: adminId,
    editSummary: `Pre-revert snapshot (before reverting to revision ${revisionId})`,
  });

  // Apply revision
  const updated = await prisma.article.update({
    where: { id: articleId },
    data: {
      title: revision.title,
      content: revision.content,
      format: revision.format,
      summary: revision.summary,
      lastEditorId: adminId,
    },
  });

  // Log audit
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "article.revert",
      targetType: "Article",
      targetId: articleId,
      payload: JSON.stringify({ revisionId }),
    },
  });

  return updated;
}
