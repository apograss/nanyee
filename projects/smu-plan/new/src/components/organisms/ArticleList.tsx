import ArticleCard from "@/components/molecules/ArticleCard";
import styles from "./ArticleList.module.css";

interface ArticleItem {
  id: string;
  title: string;
  excerpt?: string | null;
  date: string;
  tags?: string[];
  authorName?: string;
  viewCount?: number;
  isPinned?: boolean;
}

interface ArticleListProps {
  articles: ArticleItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export default function ArticleList({
  articles,
  hasMore,
  onLoadMore,
}: ArticleListProps) {
  return (
    <div className={styles.list}>
      {articles.length === 0 && (
        <p className={styles.empty}>暂无文章</p>
      )}

      <div className={styles.grid}>
        {articles.map((article) => (
          <ArticleCard key={article.id} {...article} date={article.date} />
        ))}
      </div>

      {hasMore && onLoadMore && (
        <div className={styles.moreRow}>
          <button className={styles.moreBtn} onClick={onLoadMore}>
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}
