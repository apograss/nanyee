import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { listRevisions } from "@/lib/wiki/revisions";

// GET /api/wiki/[slug]/revisions — list revision history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || "20")));

  // Find article by slug or id
  let article = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
  if (!article) {
    article = await prisma.article.findUnique({ where: { id: slug }, select: { id: true } });
  }

  if (!article) {
    return Response.json(
      { ok: false, error: { code: 404, message: "文章不存在" } },
      { status: 404 }
    );
  }

  const { revisions, total } = await listRevisions(article.id, page, limit);

  return Response.json({
    ok: true,
    data: {
      revisions: revisions.map((r) => ({
        id: r.id,
        title: r.title,
        format: r.format,
        summary: r.summary,
        editorName: r.editor.nickname || r.editor.username,
        editSummary: r.editSummary,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, limit, total },
    },
  });
}
