import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { resolveArticle } from "@/lib/wiki/comments";

// DELETE /api/wiki/[slug]/comments/[id] — delete comment (author or admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const auth = await requireUser(req);
    const { slug, id } = await params;

    // Resolve article to scope the comment
    const article = await resolveArticle(slug);
    if (!article) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Article not found" } },
        { status: 404 }
      );
    }

    const comment = await prisma.comment.findFirst({
      where: { id, articleId: article.id },
    });
    if (!comment) {
      return Response.json(
        { ok: false, error: { code: 404, message: "Comment not found" } },
        { status: 404 }
      );
    }

    // Only author or admin can delete
    if (comment.authorId !== auth.userId && auth.role !== "admin") {
      return Response.json(
        { ok: false, error: { code: 403, message: "Forbidden" } },
        { status: 403 }
      );
    }

    await prisma.comment.delete({ where: { id } });

    return Response.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
