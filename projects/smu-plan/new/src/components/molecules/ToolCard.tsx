import Link from "next/link";
import styles from "./ToolCard.module.css";

interface ToolCardProps {
  title: string;
  desc: string;
  icon: React.ReactNode;
  href: string;
  tag?: string;
}

export default function ToolCard({ title, desc, icon, href, tag }: ToolCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{title}</h3>
          {tag && <span className={styles.tag}>{tag}</span>}
        </div>
        <p className={styles.desc}>{desc}</p>
      </div>
      <span className={styles.arrow}>&rarr;</span>
    </Link>
  );
}
