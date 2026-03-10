import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleAuthError } from "@/lib/auth/guard";
import { revertToRevision } from "@/lib/wiki/revisions";
import { clearWikiSearchCache } from "@/lib/wiki/search-cache";

// POST /api/wiki/[slug]/revert/[revId] — admin-only revert to revision
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; revId: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    const { slug, revId } = await params;

    // Find article by slug or id
    let article = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
    if (!article) {
      article = await prisma.article.findUnique({ where: { id: slug }, select: { id: true } });
    }

    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Article not found" } },
        { status: 404 }
      );
    }

    const updated = await revertToRevision(article.id, revId, auth.userId);

    clearWikiSearchCache();

    return Response.json({
      ok: true,
      data: { id: updated.id, slug: updated.slug },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return Response.json(
        { ok: false, error: { code: 404, message: err.message } },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
