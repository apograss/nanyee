import Link from "next/link";

import styles from "./layout.module.css";

export default function CheckAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2 className={styles.title}>监控后台</h2>
        <nav className={styles.nav}>
          <Link href="/admin" className={styles.link}>
            总览
          </Link>
          <Link href="/" className={styles.link}>
            公开看板
          </Link>
        </nav>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  );
}