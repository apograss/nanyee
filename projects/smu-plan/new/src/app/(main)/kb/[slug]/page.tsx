import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { marked } from "marked";
import Badge from "@/components/atoms/Badge";
import ArticleEditButton from "./ArticleEditButton";
import styles from "../page.module.css";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArticleDetailPage({ params }: Props) {
  const { slug } = await params;

  const article = await prisma.article.findUnique({
    where: { slug },
    include: { author: { select: { id: true, username: true, nickname: true } } },
  });

  if (!article || article.status !== "published") {
    notFound();
  }

  // Increment view count
  prisma.article
    .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  // Check if current user is author or admin (best-effort from cookie)
  let showEditButton = false;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
    if (token) {
      const { verifyAccessToken } = await import("@/lib/auth/jwt");
      const payload = await verifyAccessToken(token);
      if (payload?.sub) {
        showEditButton = payload.sub === article.authorId || payload.role === "admin";
      }
    }
  } catch {}

  const html = await marked(article.content);
  const tags: string[] = article.tags ? JSON.parse(article.tags) : [];

  return (
    <article className={styles.articleContent}>
      <h1>{article.title}</h1>
      <div className={styles.meta}>
        <span>{article.author.nickname || article.author.username}</span>
        <span>
          {(article.publishedAt || article.createdAt).toLocaleDateString("zh-CN")}
        </span>
        <span>{article.viewCount} 阅读</span>
        {showEditButton && <ArticleEditButton articleId={article.id} />}
      </div>
      {tags.length > 0 && (
        <div className={styles.tags}>
          {tags.map((tag) => (
            <Badge key={tag} text={tag} colorVariant="mint" />
          ))}
        </div>
      )}
      <div
        className={styles.markdown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

export async function generateStaticParams() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    select: { slug: true },
  });
  return articles.map((a) => ({ slug: a.slug }));
}
