import Link from "next/link";
import { prisma } from "@/lib/prisma";
import styles from "./Footer.module.css";

export default async function Footer() {
  let footerContent = "";
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: "footerContent" },
    });
    if (setting?.value) footerContent = setting.value;
  } catch {}

  if (footerContent) {
    return (
      <footer className={styles.footer}>
        <div
          className={styles.inner}
          dangerouslySetInnerHTML={{ __html: footerContent }}
        />
      </footer>
    );
  }

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
