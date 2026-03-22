import styles from "./page.module.css";

export default function CheckLoadingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.loadingPage}>
        <div className={styles.progressShell}>
          <div className={`${styles.progressBar} ${styles.progressBarLoading}`} />
        </div>
        <section className={styles.hero}>
          <div className={styles.heroHeader}>
            <div>
              <h2 className={styles.heroTitle}>AI 服务状态</h2>
              <p className={styles.heroText}>正在加载上一次刷新数据，请稍候。</p>
            </div>
            <p className={styles.heroMeta}>正在读取快照…</p>
          </div>
        </section>
        <div className={styles.loadingGrid}>
          <article className={styles.loadingCard}><div className={styles.cardHeader}><strong>Qwen</strong><span className={`${styles.badge} ${styles.badgeUnknown}`}>加载中</span></div><div className={`${styles.loadingLine} ${styles.loadingLineHero}`} /><div className={styles.loadingMetricGrid}><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /></div></article>
          <article className={styles.loadingCard}><div className={styles.cardHeader}><strong>LongCat</strong><span className={`${styles.badge} ${styles.badgeUnknown}`}>加载中</span></div><div className={`${styles.loadingLine} ${styles.loadingLineHero}`} /><div className={styles.loadingMetricGrid}><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /><div className={`${styles.loadingLine} ${styles.loadingLineMedium}`} /><div className={`${styles.loadingLine} ${styles.loadingLineShort}`} /></div></article>
        </div>
      </div>
    </div>
  );
}
