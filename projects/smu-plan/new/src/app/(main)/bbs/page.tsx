import Link from "next/link";

import NeoButton from "@/components/atoms/NeoButton";
import { getForumBaseUrl, getLatestForumPosts } from "@/lib/forum/latest";
import { relativeTime } from "@/lib/relative-time";

import styles from "./page.module.css";

export const revalidate = 120;

export default async function BBSPage() {
  const forumUrl = getForumBaseUrl();
  const latestTopics = await getLatestForumPosts(6).catch(() => []);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            校园论坛 · 同标签页进入
          </div>
          <h1 className={styles.title}>
            在 <span className={styles.highlight}>论坛</span> 里继续提问、分享和互助
          </h1>
          <p className={styles.subtitle}>
            论坛已经独立运行，但入口仍然保留在主站体系里。第一次使用时，直接点击论坛里的
            OAuth 登录，系统会自动为你创建账号。
          </p>
          <div className={styles.metaList}>
            <span className={styles.metaItem}>同标签页跳转，不再额外开新窗口</span>
            <span className={styles.metaItem}>主站账号可直接通过 OAuth 登录</span>
            <span className={styles.metaItem}>讨论、提问、拼车、资源分享都在这里</span>
          </div>
          <div className={styles.actions}>
            <a href={forumUrl}>
              <NeoButton variant="primary" size="lg">
                进入论坛
              </NeoButton>
            </a>
            <Link href="/bbs/new" className={styles.secondaryLink}>
              我想发帖
            </Link>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>最新活跃主题</h2>
            <p className={styles.panelSubtitle}>
              首页会同步抓取论坛最新帖子，这里也保留一份完整入口，方便从主站直接继续浏览。
            </p>
            <div className={styles.topicList}>
              {latestTopics.length > 0 ? (
                latestTopics.map((topic) => (
                  <a key={topic.id} href={topic.href} className={styles.topicCard}>
                    <h3 className={styles.topicTitle}>{topic.title}</h3>
                    <div className={styles.topicMeta}>
                      <span>作者：{topic.authorName}</span>
                      <span>{topic.replyCount} 条回复</span>
                      <span>{topic.lastPostedAt ? relativeTime(topic.lastPostedAt) : "刚刚活跃"}</span>
                    </div>
                  </a>
                ))
              ) : (
                <div className={styles.emptyCard}>
                  <strong>论坛接口已经接通</strong>
                  <span>当前还没有可展示的公开新帖，或者帖子列表正在刷新中。</span>
                </div>
              )}
            </div>
          </div>

          <aside className={styles.panel}>
            <h2 className={styles.panelTitle}>使用提醒</h2>
            <div className={styles.tips}>
              <div className={styles.tipCard}>
                <h3 className={styles.tipTitle}>第一次登录</h3>
                <p className={styles.tipText}>
                  打开论坛后直接点击 OAuth 登录，不需要先在论坛里单独注册密码账号。
                </p>
              </div>
              <div className={styles.tipCard}>
                <h3 className={styles.tipTitle}>发帖入口</h3>
                <p className={styles.tipText}>
                  如果你准备发布主题，可以继续走下一步，我们会把你带到论坛主界面。
                </p>
              </div>
              <div className={styles.tipCard}>
                <h3 className={styles.tipTitle}>返回主站</h3>
                <p className={styles.tipText}>
                  论坛和主站保持同一套账号体系，知识库和工具区仍然从导航栏随时可回。
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
