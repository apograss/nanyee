import styles from "./MessageItem.module.css";

interface MessageItemProps {
  author: string;
  content: string;
  time: string;
}

export default function MessageItem({ author, content, time }: MessageItemProps) {
  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <span className={styles.author}>{author}</span>
        <span className={styles.time}>
          {new Date(time).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <p className={styles.content}>{content}</p>
    </div>
  );
}
