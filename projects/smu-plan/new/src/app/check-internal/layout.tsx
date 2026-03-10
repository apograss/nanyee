import Link from "next/link";

import styles from "./layout.module.css";

export default function CheckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>check.nanyee.de</p>
          <h1 className={styles.title}>AI 状态看板</h1>
        </div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.navLink}>
            公开页
          </Link>
          <Link href="/admin" className={styles.navLink}>
            管理员
          </Link>
          <a href="https://nanyee.de" className={styles.navLink}>
            主站
          </a>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}