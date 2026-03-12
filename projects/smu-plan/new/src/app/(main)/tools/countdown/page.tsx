import type { Metadata } from "next";

import calendar from "../../../../../data/academic-calendar.json";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "考试倒计时",
};

export const revalidate = 86400;

type CalendarItem = {
  id: string;
  title: string;
  date: string;
  description: string;
};

function daysUntil(date: string) {
  const today = new Date();
  const target = new Date(`${date}T00:00:00+08:00`);
  const diff = target.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function CountdownPage() {
  const items = (calendar as CalendarItem[])
    .map((item) => ({
      ...item,
      daysLeft: daysUntil(item.date),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const focus = items[0];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <div className={styles.eyebrow}>考试倒计时</div>
          <h1 className={styles.title}>把重要节点提前看见，准备就会从容一些。</h1>
          <p className={styles.desc}>
            这里汇总了学期内常见的重要时间点。我们先用静态日历版本上线，方便大家在工具区快速查看接下来的节奏变化。
          </p>
        </div>

        <div className={`${styles.heroCard} ${styles.focusCard}`}>
          <span className={styles.focusLabel}>最近的提醒</span>
          <div className={styles.focusTitle}>{focus?.title ?? "暂无事件"}</div>
          <div className={styles.focusCount}>{focus ? `${focus.daysLeft} 天` : "--"}</div>
        </div>
      </section>

      <section className={styles.listCard}>
        <h2 className={styles.sectionTitle}>学期节点</h2>
        <div className={styles.list}>
          {items.map((item) => (
            <article key={item.id} className={styles.item}>
              <div>
                <h3 className={styles.itemTitle}>{item.title}</h3>
              </div>
              <span className={styles.meta}>
                {item.date} · 剩余 {item.daysLeft} 天
              </span>
              <p className={styles.itemDesc}>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
