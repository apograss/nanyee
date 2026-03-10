import Link from "next/link";
import Badge from "@/components/atoms/Badge";
import styles from "./ArticleCard.module.css";

interface ArticleCardProps {
  id: string;
  title: string;
  excerpt?: string | null;
  date: string;
  tags?: string[];
  authorName?: string;
  viewCount?: number;
  isPinned?: boolean;
}

export default function ArticleCard({
  id,
  title,
  excerpt,
  date,
  tags,
  authorName,
  viewCount,
  isPinned,
}: ArticleCardProps) {
  return (
    <Link href={`/kb/${id}`} className={`${styles.card} ${isPinned ? styles.pinned : ""}`}>
      {isPinned && <span className={styles.pinBadge}>&#x1F4CC; 置顶</span>}
      <h3 className={styles.title}>{title}</h3>
      {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      <div className={styles.meta}>
        {authorName && <span className={styles.author}>{authorName}</span>}
        <span className={styles.date}>
          {new Date(date).toLocaleDateString("zh-CN")}
        </span>
        {viewCount !== undefined && (
          <span className={styles.views}>{viewCount} 次浏览</span>
        )}
      </div>
      {tags && tags.length > 0 && (
        <div className={styles.tags}>
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag} text={tag} colorVariant="mint" />
          ))}
        </div>
      )}
    </Link>
  );
}
