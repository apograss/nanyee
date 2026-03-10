"use client";

import Link from "next/link";

import styles from "./ArticleEditButton.module.css";

export default function ArticleEditButton({ articleId }: { articleId: string }) {
  return (
    <Link href={`/editor?id=${articleId}`} className={styles.button}>
      参与编辑
    </Link>
  );
}
