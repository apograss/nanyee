import type { KBStats } from "@/lib/wiki/queries";
import WikiCreateButton from "./WikiCreateButton";
import styles from "./KBHeroBanner.module.css";

interface KBHeroBannerProps {
  stats: KBStats;
}

export default function KBHeroBanner({ stats }: KBHeroBannerProps) {
  return (
    <section className={styles.banner}>
      <div className={styles.text}>
        <div className={styles.kicker}>共建知识库</div>
        <h2 className={styles.title}>南医校园经验，一起写、持续更新</h2>
        <p className={styles.desc}>登录即可补充和修正，每次编辑都保留版本记录。</p>
      </div>
      <div className={styles.actions}>
        <div className={styles.stat}>
          <strong className={styles.statValue}>{stats.totalArticles}</strong>
          <span className={styles.statLabel}>篇经验</span>
        </div>
        <div className={styles.stat}>
          <strong className={styles.statValue}>{stats.totalContributors}</strong>
          <span className={styles.statLabel}>贡献者</span>
        </div>
        <WikiCreateButton />
      </div>
    </section>
  );
}
