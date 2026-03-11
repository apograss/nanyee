"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import ThemeToggle from "@/components/atoms/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_NAV_LINKS,
  normalizeNavLinks,
  type NavLinkConfig,
} from "@/lib/site/nav";

import styles from "./Header.module.css";

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navLinks, setNavLinks] = useState<NavLinkConfig[]>(DEFAULT_NAV_LINKS);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        if (!data.ok || !data.data.settings.navLinks) {
          return;
        }

        try {
          const parsed = JSON.parse(data.data.settings.navLinks);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNavLinks(normalizeNavLinks(parsed));
          }
        } catch {
          // Ignore invalid custom nav JSON and keep the default links.
        }
      })
      .catch(() => {
        // Keep the default nav when settings cannot be loaded.
      });
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
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.navLink} ${
                  pathname === link.href ? styles.active : ""
                }`}
              >
                {link.label}
              </Link>
            ),
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
              {menuOpen ? (
                <div className={styles.dropdown}>
                  {user.role === "admin" ? (
                    <Link
                      href="/admin"
                      className={styles.dropItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      管理后台
                    </Link>
                  ) : null}
                  <Link
                    href="/settings"
                    className={styles.dropItem}
                    onClick={() => setMenuOpen(false)}
                  >
                    账号设置
                  </Link>
                  <Link
                    href="/editor"
                    className={styles.dropItem}
                    onClick={() => setMenuOpen(false)}
                  >
                    发起共建
                  </Link>
                  <button onClick={handleLogout} className={styles.dropItem}>
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <Link href="/login" className={styles.loginBtn}>
              登录
            </Link>
          )}

          <button
            className={styles.hamburger}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="切换菜单"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className={styles.mobileNav}>
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                className={styles.mobileLink}
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.mobileLink} ${
                  pathname === link.href ? styles.active : ""
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </header>
  );
}
