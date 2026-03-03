"use client";

import Link from "next/link";

export default function ArticleEditButton({ articleId }: { articleId: string }) {
  return (
    <Link
      href={`/editor?id=${articleId}`}
      style={{
        fontWeight: "bold",
        fontSize: "var(--text-sm)",
        color: "var(--color-brand)",
        textDecoration: "underline",
        cursor: "pointer",
      }}
    >
      编辑
    </Link>
  );
}
