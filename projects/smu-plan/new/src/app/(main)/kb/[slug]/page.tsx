import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import Badge from "@/components/atoms/Badge";
import { prisma } from "@/lib/prisma";
import { renderArticleBody } from "@/lib/wiki/render";
import { presentPublicUser } from "@/lib/user-presenter";
import CommentSystem from "@/components/organisms/CommentSystem/CommentSystem";

import ArticleEditButton from "./ArticleEditButton";
import styles from "../page.module.css";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;

  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, username: true, nickname: true, status: true } },
      lastEditor: { select: { id: true, username: true, nickname: true, status: true } },
    },
  });

  if (!article || article.status !== "published") {
    notFound();
  }

  prisma.article
    .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  let isLoggedIn = false;
  let isAdmin = false;
  let currentUserId: string | undefined;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
    if (token) {
      const { verifyAccessToken } = await import("@/lib/auth/jwt");
      const payload = await verifyAccessToken(token);
      if (payload?.sub) {
        isLoggedIn = true;
        isAdmin = payload.role === "admin";
        currentUserId = payload.sub;
      }
    }
  } catch {}

  const canEdit = isLoggedIn && (!article.isLocked || isAdmin);
  const html = await renderArticleBody({
    content: article.content,
    format: article.format as "html" | "markdown",
  });
  const tags: string[] = article.tags ? JSON.parse(article.tags) : [];

  return (
    <article className={styles.articleContent}>
      <header className={styles.articleHeader}>
        <div>
          <h1>{article.title}</h1>
          <div className={styles.meta}>
            <span>{presentPublicUser(article.author).displayName}</span>
            {article.lastEditor && (
              <span>最后编辑：{presentPublicUser(article.lastEditor).displayName}</span>
            )}
            <span>{(article.publishedAt || article.createdAt).toLocaleDateString("zh-CN")}</span>
            <span>{article.viewCount} 次浏览</span>
            {article.isLocked && (
              <span style={{ color: "var(--color-warning)", fontWeight: "bold" }}>
                已锁定
              </span>
            )}
          </div>
        </div>

        <div className={styles.articleActions}>
          {canEdit && <ArticleEditButton articleId={article.id} />}
          <a href={`/kb/${slug}/history`} className={styles.historyLink}>
            查看版本历史
          </a>
        </div>
      </header>

      {tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag) => (
            <Badge key={tag} text={tag} colorVariant="mint" />
          ))}
        </div>
      )}

      <div className={styles.markdown} style={{ position: "relative", overflow: "visible" }} data-article-body dangerouslySetInnerHTML={{ __html: html }} />

      <CommentSystem
        articleSlug={slug}
        isLoggedIn={isLoggedIn}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </article>
  );
}

export async function generateStaticParams() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { slug: true },
  });

  return articles.map((article) => ({ slug: article.slug }));
}
