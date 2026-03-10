"use client";

import NeoButton from "@/components/atoms/NeoButton";
import styles from "./page.module.css";

const FORUM_URL = "https://chat.nanyee.de";

export default function BBSPage() {
  return (
    <div className={styles.container}>
      <div className={styles.migrationNotice}>
        <h1 className={styles.title}>论坛已迁移</h1>
        <p className={styles.subtitle}>
          社区论坛已迁移到新平台，请访问新地址继续交流。
        </p>
        <a href={FORUM_URL} target="_blank" rel="noopener noreferrer">
          <NeoButton variant="primary" size="lg">
            前往新论坛 chat.nanyee.de
          </NeoButton>
        </a>
      </div>
    </div>
  );
}
