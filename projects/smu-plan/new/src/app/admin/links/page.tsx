"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "../audit/page.module.css";

export default function AdminLinksPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/links");
  }, [router]);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>链接管理</h1>
      </div>
      <p style={{ color: "var(--text-muted)", padding: "var(--space-lg)" }}>
        链接管理已迁移到公开链接页面。正在跳转...
      </p>
    </div>
  );
}
