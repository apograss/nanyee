"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/atoms/ThemeToggle";
import styles from "./Header.module.css";

const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/kb", label: "知识库" },
  { href: "/bbs", label: "论坛" },
  { href: "/tools", label: "工具" },
  { href: "/links", label: "链接" },
  { href: "/guestbook", label: "留言板" },
  { href: "/about", label: "关于" },
];

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Nanyee.de
        </Link>

        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${pathname === link.href ? styles.active : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />

          {user ? (
            <div className={styles.userMenu}>
              <button
                className={styles.userBtn}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {user.nickname || user.username}
              </button>
              {menuOpen && (
                <div className={styles.dropdown}>
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      className={styles.dropItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      管理后台
                    </Link>
                  )}
                  <Link
                    href="/editor"
                    className={styles.dropItem}
                    onClick={() => setMenuOpen(false)}
                  >
                    投稿
                  </Link>
                  <button onClick={handleLogout} className={styles.dropItem}>
                    退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className={styles.loginBtn}>
              登录
            </Link>
          )}

          <button
            className={styles.hamburger}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <div className={styles.mobileNav}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.mobileLink} ${pathname === link.href ? styles.active : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
