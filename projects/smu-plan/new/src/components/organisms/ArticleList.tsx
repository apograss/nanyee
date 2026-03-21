import ArticleCard from "@/components/molecules/ArticleCard";
import styles from "./ArticleList.module.css";

interface ArticleItem {
  id: string;
  title: string;
  excerpt?: string | null;
  date: string;
  categoryName?: string | null;
  categoryIcon?: string | null;
  parentCategoryName?: string | null;
  parentCategoryIcon?: string | null;
  tags?: string[];
  authorName?: string;
  authorAvatar?: string | null;
  viewCount?: number;
  isPinned?: boolean;
  isNew?: boolean;
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
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📝</span>
          <p className={styles.emptyTitle}>暂无文章</p>
          <p className={styles.emptyHint}>这个分类下还没有文章，快来写第一篇吧</p>
        </div>
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
