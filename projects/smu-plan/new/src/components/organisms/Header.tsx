"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/atoms/ThemeToggle";
import styles from "./Header.module.css";

const DEFAULT_NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/kb", label: "知识库" },
  // { href: "/bbs", label: "论坛" },        // TODO: 登录系统完成后恢复
  { href: "/tools", label: "工具" },
  { href: "/links", label: "链接" },
  // { href: "/guestbook", label: "留言板" }, // TODO: 登录系统完成后恢复
  { href: "/about", label: "关于" },
];

interface NavLinkConfig {
  href: string;
  label: string;
  external?: boolean;
}

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navLinks, setNavLinks] = useState<NavLinkConfig[]>(DEFAULT_NAV_LINKS);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data.settings.navLinks) {
          try {
            const parsed = JSON.parse(data.data.settings.navLinks);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setNavLinks(parsed);
            }
          } catch { }
        }
      })
      .catch(() => { });
  }, []);

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
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                className={styles.navLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.navLink} ${pathname === link.href ? styles.active : ""}`}
              >
                {link.label}
              </Link>
            )
          )}
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
                    href="/profile"
                    className={styles.dropItem}
                    onClick={() => setMenuOpen(false)}
                  >
                    个人中心
                  </Link>
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
            <span className={styles.loginBtn} style={{ opacity: 0.5, cursor: "default" }} title="即将开放">
              登录
            </span>
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
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                className={styles.mobileLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.mobileLink} ${pathname === link.href ? styles.active : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}
