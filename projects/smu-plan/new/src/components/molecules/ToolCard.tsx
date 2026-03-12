import Link from "next/link";
import styles from "./ToolCard.module.css";

interface ToolCardProps {
  title: string;
  desc: string;
  icon: React.ReactNode;
  href: string;
  tag?: string;
  disabled?: boolean;
}

export default function ToolCard({ title, desc, icon, href, tag, disabled }: ToolCardProps) {
  const content = (
    <>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{title}</h3>
          {tag && (
            <span className={`${styles.tag} ${disabled ? styles.tagMuted : ""}`}>
              {tag}
            </span>
          )}
        </div>
        <p className={styles.desc}>{desc}</p>
      </div>
      <span className={styles.arrow}>&rarr;</span>
    </>
  );

  if (disabled) {
    return (
      <div className={`${styles.card} ${styles.cardDisabled}`} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={styles.card}>
      {content}
    </Link>
  );
}
