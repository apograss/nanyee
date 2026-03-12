import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import Badge from "@/components/atoms/Badge";
import { prisma } from "@/lib/prisma";
import { renderArticleBody } from "@/lib/wiki/render";
import { presentPublicUser } from "@/lib/user-presenter";
import CommentSystem from "@/components/organisms/CommentSystem/CommentSystem";
import TableOfContents from "@/components/organisms/TableOfContents/TableOfContents";

import ArticleEditButton from "./ArticleEditButton";
import styles from "./article.module.css";

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
      categoryRef: {
        include: {
          parent: { select: { id: true, name: true, slug: true, icon: true } },
        },
      },
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
  const publishedDate = (article.publishedAt || article.createdAt).toLocaleDateString("zh-CN");
  const author = presentPublicUser(article.author).displayName;
  const lastEditor = article.lastEditor
    ? presentPublicUser(article.lastEditor).displayName
    : null;

  return (
    <div className={styles.page}>
      <article className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.kicker}>知识库 Wiki</p>
          <h1 className={styles.title}>{article.title}</h1>
          {article.summary ? <p className={styles.summary}>{article.summary}</p> : null}

          <div className={styles.meta}>
            <span className={styles.metaItem}>作者：{author}</span>
            {lastEditor ? <span className={styles.metaItem}>最后编辑：{lastEditor}</span> : null}
            <span className={styles.metaItem}>发布日期：{publishedDate}</span>
            <span className={styles.metaItem}>{article.viewCount} 次浏览</span>
            {article.isLocked ? (
              <span className={`${styles.metaItem} ${styles.locked}`}>已锁定</span>
            ) : null}
          </div>

          <div className={styles.categoryBar}>
            {article.categoryRef?.parent ? (
              <span className={styles.categoryPill}>
                {article.categoryRef.parent.icon || "📚"} {article.categoryRef.parent.name}
              </span>
            ) : null}
            {article.categoryRef ? (
              <span className={styles.categoryPill}>
                {article.categoryRef.icon || "📄"} {article.categoryRef.name}
              </span>
            ) : article.category ? (
              <span className={styles.categoryPill}>📄 {article.category}</span>
            ) : null}
            {tags.map((tag) => (
              <Badge key={tag} text={tag} colorVariant="mint" />
            ))}
          </div>

          <div className={styles.actions}>
            {canEdit ? <ArticleEditButton articleId={article.id} /> : null}
            <a href={`/kb/${slug}/history`} className={styles.historyLink}>
              查看版本历史
            </a>
          </div>
        </header>

        <div className={styles.contentLayout}>
          <div className={styles.bodyCard}>
            <div
              className={styles.markdown}
              data-article-body
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
          <TableOfContents html={html} />
        </div>

        <CommentSystem
          articleSlug={slug}
          isLoggedIn={isLoggedIn}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      </article>
    </div>
  );
}

export async function generateStaticParams() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { slug: true },
  });

  return articles.map((article) => ({ slug: article.slug }));
}
