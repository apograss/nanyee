import { prisma } from "@/lib/prisma";
import ArticleList from "@/components/organisms/ArticleList";
import styles from "./page.module.css";

export const revalidate = 60; // ISR: revalidate every 60s

export default async function KBPage() {
  const articles = await prisma.article.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: { author: { select: { username: true, nickname: true } } },
  });

  const data = articles.map((a) => ({
    id: a.slug,
    title: a.title,
    excerpt: a.summary,
    date: (a.publishedAt || a.createdAt).toISOString(),
    tags: a.tags ? JSON.parse(a.tags) : [],
    authorName: a.author.nickname || a.author.username,
    viewCount: a.viewCount,
  }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>知识库</h1>
        <p className={styles.desc}>南医校园指南、攻略与经验分享</p>
      </div>
      <ArticleList articles={data} />
    </div>
  );
}
