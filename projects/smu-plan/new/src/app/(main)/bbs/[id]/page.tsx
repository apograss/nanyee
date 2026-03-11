import Link from "next/link";

import NeoButton from "@/components/atoms/NeoButton";
import { getForumBaseUrl } from "@/lib/forum/latest";

import styles from "../page.module.css";

export default async function BBSTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const forumUrl = getForumBaseUrl();
  const { id: legacyTopicId } = await params;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            旧帖子链接桥接
          </div>
          <h1 className={styles.title}>这个旧论坛链接需要手动接续</h1>
          <p className={styles.subtitle}>
            旧论坛主题还没有和新论坛建立稳定的一一映射，所以我们暂时不能自动跳到对应的新帖。
            不过你可以带着旧主题编号继续去论坛里搜索。
          </p>
          <div className={styles.legacyTag}>
            旧主题编号
            <span className={styles.legacyCode}>{legacyTopicId}</span>
          </div>
          <div className={styles.actions}>
            <a href={forumUrl}>
              <NeoButton variant="primary" size="lg">
                去论坛继续查找
              </NeoButton>
            </a>
            <Link href="/bbs" className={styles.secondaryLink}>
              返回论坛入口页
            </Link>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>接下来的建议</h2>
          <div className={styles.tips}>
            <div className={styles.tipCard}>
              <h3 className={styles.tipTitle}>先搜索标题关键词</h3>
              <p className={styles.tipText}>
                如果你还记得帖子标题或主题，直接在论坛里搜索关键词会更容易定位到新帖。
              </p>
            </div>
            <div className={styles.tipCard}>
              <h3 className={styles.tipTitle}>实在找不到就重新发帖</h3>
              <p className={styles.tipText}>
                如果内容已经过期，重新发一个新主题通常比继续追旧帖更有效。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
