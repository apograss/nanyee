import styles from "./page.module.css";

export default function CheckAdminLoadingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.loadingPage}>
        <div className={styles.progressShell}>
          <div className={`${styles.progressBar} ${styles.progressBarLoading}`} />
        </div>
        <div className={styles.loadingHeader}>
          <h2 className={styles.title}>统一 AI 监控</h2>
          <p className={styles.subtitle}>正在加载 ChatGPT 与 Grok 的上一次快照。</p>
        </div>
        <div className={styles.loadingGrid}>
          <article className={styles.loadingCard}><div className={styles.cardHeader}><strong>ChatGPT</strong><span className={`${styles.badge} ${styles.badgeUnknown}`}>加载中</span></div><div className={`${styles.loadingLine} ${styles.loadingLineHero}`} /><div className={styles.loadingMetricGrid}><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /></div></article>
          <article className={styles.loadingCard}><div className={styles.cardHeader}><strong>Grok</strong><span className={`${styles.badge} ${styles.badgeUnknown}`}>加载中</span></div><div className={`${styles.loadingLine} ${styles.loadingLineHero}`} /><div className={styles.loadingMetricGrid}><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /></div></article>
        </div>
      </div>
    </div>
  );
}
