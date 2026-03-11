import Link from "next/link";

import NeoButton from "@/components/atoms/NeoButton";
import { getForumBaseUrl } from "@/lib/forum/latest";

import styles from "../page.module.css";

export default function NewTopicPage() {
  const forumUrl = getForumBaseUrl();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            准备发布主题
          </div>
          <h1 className={styles.title}>下一步就去论坛里开一帖</h1>
          <p className={styles.subtitle}>
            论坛仍然是独立服务，但我们保留了主站入口。你会在当前标签页进入论坛，
            首次使用时直接点击 OAuth 登录即可自动建号。
          </p>
          <div className={styles.actions}>
            <a href={forumUrl}>
              <NeoButton variant="primary" size="lg">
                进入论坛后发布主题
              </NeoButton>
            </a>
            <Link href="/bbs" className={styles.secondaryLink}>
              返回论坛入口页
            </Link>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>发帖前建议</h2>
          <div className={styles.tips}>
            <div className={styles.tipCard}>
              <h3 className={styles.tipTitle}>标题尽量具体</h3>
              <p className={styles.tipText}>
                像“二饭麻辣烫怎么样”会比“求推荐”更容易得到有效回复。
              </p>
            </div>
            <div className={styles.tipCard}>
              <h3 className={styles.tipTitle}>涉及攻略时优先补充到 Wiki</h3>
              <p className={styles.tipText}>
                如果内容是可长期复用的经验，优先整理成知识库文章；如果是实时交流，再发到论坛。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
