import Link from "next/link";

const FORUM_URL = "https://chat.nanyee.de";

export default function NewTopicPage() {
  return (
    <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem" }}>论坛已迁移</h1>
      <p style={{ marginBottom: "1.5rem", lineHeight: 1.7 }}>
        发帖入口已经迁移到新论坛。请前往
        {" "}
        <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
          chat.nanyee.de
        </a>
        {" "}
        后点击“发布主题”继续。
      </p>
      <p style={{ marginBottom: "2rem", color: "var(--text-secondary)" }}>
        如果尚未登录，请先在主站完成登录，再使用论坛中的 OAuth 入口。
      </p>
      <Link href="/bbs" style={{ marginRight: "1rem" }}>
        返回论坛说明页
      </Link>
      <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
        打开新论坛
      </a>
    </div>
  );
}
