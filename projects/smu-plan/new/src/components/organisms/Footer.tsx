import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.love}>
          Made with <span className={styles.heart}>&hearts;</span> by{" "}
          <Link href="/about" className={styles.brand}>
            Nanyee.de
          </Link>
        </span>
        <span className={styles.copy}>
          &copy; {new Date().getFullYear()} Southern Medical University
        </span>
      </div>
    </footer>
  );
}
