import Link from "next/link";

const FORUM_URL = "https://chat.nanyee.de";

export default async function BBSTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: legacyTopicId } = await params;

  return (
    <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
      <h1 style={{ marginBottom: "1rem" }}>旧论坛链接已迁移</h1>
      <p style={{ marginBottom: "1rem", lineHeight: 1.7 }}>
        当前访问的是旧论坛帖子链接，系统暂时无法自动映射到新论坛中的对应主题。
      </p>
      <p style={{ marginBottom: "1.5rem", color: "var(--text-secondary)" }}>
        旧主题标识：
        {" "}
        <code>{legacyTopicId}</code>
      </p>
      <p style={{ marginBottom: "2rem", lineHeight: 1.7 }}>
        请前往
        {" "}
        <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
          chat.nanyee.de
        </a>
        {" "}
        搜索标题或关键词继续查看。
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
