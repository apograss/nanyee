import Link from "next/link";
import styles from "./ArticleCard.module.css";

// Tag → emoji mapping for thumbnails
const TAG_EMOJI: Record<string, string> = {
  选课: "📖",
  实习: "💼",
  考试: "📝",
  社团: "🎪",
  宿舍: "🏠",
  食堂: "🍜",
  交通: "🚌",
  学费: "💰",
  图书馆: "📖",
  医院: "🏥",
  运动: "⚽",
  奖学金: "🏆",
  保研: "🎓",
  考研: "📐",
  就业: "👔",
  军训: "🎖️",
  入学: "🎒",
  数学: "📐",
  化学: "🧪",
  生物: "🔬",
  英语: "🌐",
  法治: "⚖️",
  中医: "🏥",
  计算机: "💻",
};

function getEmojiForTags(tags?: string[], title?: string): string {
  // Try tags first
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      for (const [keyword, emoji] of Object.entries(TAG_EMOJI)) {
        if (tag.includes(keyword)) return emoji;
      }
    }
  }
  // Fall back to title keywords
  if (title) {
    for (const [keyword, emoji] of Object.entries(TAG_EMOJI)) {
      if (title.includes(keyword)) return emoji;
    }
  }
  return "📄";
}

// Stable color based on name
const AUTHOR_COLORS = ["#E8652B", "#457B9D", "#4CAF50", "#9B59B6", "#E74C3C", "#27ae60", "#2196F3"];
function getAuthorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

interface ArticleCardProps {
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

export default function ArticleCard({
  id,
  title,
  excerpt,
  date,
  categoryName,
  categoryIcon,
  parentCategoryName,
  parentCategoryIcon,
  tags,
  authorName,
  authorAvatar,
  viewCount,
  isPinned,
  isNew,
}: ArticleCardProps) {
  const emoji = categoryIcon || getEmojiForTags(tags, title);
  const authorColor = authorName ? getAuthorColor(authorName) : "#E8652B";

  return (
    <Link href={`/kb/${id}`} className={`${styles.card} ${isPinned ? styles.pinned : ""}`}>
      {isPinned && <span className={styles.pinIcon}>📌</span>}

      <div className={styles.thumb}>{emoji}</div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{title}</h3>
          {isPinned && <span className={styles.pinnedBadge}>置顶</span>}
          {isNew && !isPinned && <span className={styles.newBadge}>NEW</span>}
        </div>

        {(parentCategoryName || categoryName) && (
          <div className={styles.categoryTrail}>
            {parentCategoryName ? (
              <span className={styles.categoryPill}>
                {parentCategoryIcon || "📚"} {parentCategoryName}
              </span>
            ) : null}
            {categoryName ? (
              <span className={styles.categoryPill}>
                {categoryIcon || "📄"} {categoryName}
              </span>
            ) : null}
          </div>
        )}

        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}

        <div className={styles.meta}>
          <span className={styles.author}>
            {authorAvatar ? (
              <img src={authorAvatar} alt="" className={styles.authorAvatar} />
            ) : (
              <span
                className={styles.authorDot}
                style={{ background: authorColor }}
              >
                {authorName ? authorName.charAt(0) : "?"}
              </span>
            )}
            {authorName ?? "匿名"}
          </span>
          <span className={styles.views}>👁 {viewCount ?? 0}</span>
          {tags && tags.length > 0 && (
            <div className={styles.tags}>
              {tags.slice(0, 2).map((tag, i) => (
                <span
                  key={tag}
                  className={`${styles.tagBadge} ${i === 1 ? styles.tagMint : ""}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
