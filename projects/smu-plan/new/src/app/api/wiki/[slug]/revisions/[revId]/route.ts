import { prisma } from "@/lib/prisma";
import { getRevisionDetail } from "@/lib/wiki/revisions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; revId: string }> },
) {
  const { slug, revId } = await params;

  let article = await prisma.article.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!article) {
    article = await prisma.article.findUnique({
      where: { id: slug },
      select: { id: true },
    });
  }

  if (!article) {
    return Response.json(
      { ok: false, error: { code: 404, message: "文章不存在" } },
      { status: 404 },
    );
  }

  const revision = await getRevisionDetail(article.id, revId);
  if (!revision) {
    return Response.json(
      { ok: false, error: { code: 404, message: "历史版本不存在" } },
      { status: 404 },
    );
  }

  return Response.json({
    ok: true,
    data: {
      revision: {
        id: revision.id,
        title: revision.title,
        content: revision.content,
        format: revision.format,
        summary: revision.summary,
        editorName: revision.editor.nickname || revision.editor.username,
        editSummary: revision.editSummary,
        createdAt: revision.createdAt.toISOString(),
      },
    },
  });
}
