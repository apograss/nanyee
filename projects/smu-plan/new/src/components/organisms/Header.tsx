"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import ThemeToggle from "@/components/atoms/ThemeToggle";
import AnnouncementBell from "@/components/organisms/AnnouncementBell/AnnouncementBell";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_NAV_LINKS,
  normalizeNavLinks,
  type NavLinkConfig,
} from "@/lib/site/nav";

import styles from "./Header.module.css";

const TOOL_MENU_ITEMS = [
  { href: "/tools/schedule", label: "课表导出" },
  { href: "/tools/grades", label: "成绩查询" },
  { href: "/tools/enroll", label: "自动选课" },
  { href: "/links", label: "校园导航" },
  { href: "/tools/countdown", label: "考试倒计时" },
];

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [navLinks, setNavLinks] = useState<NavLinkConfig[]>(DEFAULT_NAV_LINKS);
  const navToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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
    setUserMenuOpen(false);
    setNavOpen(false);
    setToolsMenuOpen(false);
  };

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;

      if (
        navOpen &&
        mobileNavRef.current &&
        navToggleRef.current &&
        !mobileNavRef.current.contains(target) &&
        !navToggleRef.current.contains(target)
      ) {
        setNavOpen(false);
      }

      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(target)
      ) {
        setUserMenuOpen(false);
      }

      if (navOpen && !mobileNavRef.current?.contains(target)) {
        setToolsMenuOpen(false);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [navOpen, userMenuOpen]);

  const isActiveLink = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const mobileToolsLinkClasses = `${styles.mobileLink} ${
    isActiveLink("/tools") ? styles.active : ""
  }`;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Nanyee.de
        </Link>

        <nav className={styles.nav}>
          {navLinks.map((link) =>
            !link.external && link.href === "/tools" ? (
              <div key={link.href} className={styles.navDropdown}>
                <Link
                  href={link.href}
                  className={`${styles.navLink} ${
                    isActiveLink(link.href) ? styles.active : ""
                  }`}
                >
                  {link.label}
                </Link>
                <div className={styles.navDropdownMenu}>
                  {TOOL_MENU_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className={styles.navDropdownItem}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) :
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
                  isActiveLink(link.href) ? styles.active : ""
                }`}
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className={styles.actions}>
          <AnnouncementBell />
          <ThemeToggle />

          {user ? (
            <div className={styles.userMenu} ref={userMenuRef}>
              <button
                className={styles.userBtn}
                aria-expanded={userMenuOpen}
                onClick={() => {
                  setUserMenuOpen((open) => !open);
                  setNavOpen(false);
                  setToolsMenuOpen(false);
                }}
              >
                {user.nickname || user.username}
              </button>
              {userMenuOpen ? (
                <div className={styles.dropdown}>
                  {user.role === "admin" ? (
                    <Link
                      href="/admin"
                      className={styles.dropItem}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      管理后台
                    </Link>
                  ) : null}
                  <Link
                    href="/settings"
                    className={styles.dropItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    账号设置
                  </Link>
                  <Link
                    href="/editor"
                    className={styles.dropItem}
                    onClick={() => setUserMenuOpen(false)}
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
            ref={navToggleRef}
            className={styles.hamburger}
            onClick={() => {
              setNavOpen((open) => !open);
              setUserMenuOpen(false);
              setToolsMenuOpen(false);
            }}
            aria-label="导航菜单"
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {navOpen ? (
        <div className={styles.mobileNav} id="mobile-nav" ref={mobileNavRef}>
          <div className={styles.mobileNavInner}>
            <div className={styles.mobileNavLinks}>
              {navLinks.map((link) =>
                !link.external && link.href === "/tools" ? (
                  <div key={link.href} className={styles.mobileTools}>
                    <button
                      type="button"
                      className={mobileToolsLinkClasses}
                      onClick={() => setToolsMenuOpen((open) => !open)}
                      aria-expanded={toolsMenuOpen}
                    >
                      <span>{link.label}</span>
                      <span className={styles.mobileToolsArrow}>{toolsMenuOpen ? "−" : "+"}</span>
                    </button>
                    {toolsMenuOpen ? (
                      <div className={styles.mobileSubnav}>
                        {TOOL_MENU_ITEMS.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.mobileSubLink} ${
                              isActiveLink(item.href) ? styles.active : ""
                            }`}
                            onClick={() => {
                              setToolsMenuOpen(false);
                              setNavOpen(false);
                            }}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    className={styles.mobileLink}
                    rel="noopener noreferrer"
                    onClick={() => setNavOpen(false)}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`${styles.mobileLink} ${
                      isActiveLink(link.href) ? styles.active : ""
                    }`}
                    onClick={() => setNavOpen(false)}
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>

            <div className={styles.mobileAuth}>
              {user ? (
                <>
                  <div className={styles.mobileUserMeta}>
                    <strong className={styles.mobileUserName}>
                      {user.nickname || user.username}
                    </strong>
                    <span className={styles.mobileUserRole}>
                      {user.role === "admin" ? "管理员账户" : "已登录用户"}
                    </span>
                  </div>
                  <div className={styles.mobileAuthActions}>
                    {user.role === "admin" ? (
                      <Link
                        href="/admin"
                        className={styles.mobileSecondaryAction}
                        onClick={() => setNavOpen(false)}
                      >
                        管理后台
                      </Link>
                    ) : null}
                    <Link
                      href="/settings"
                      className={styles.mobileSecondaryAction}
                      onClick={() => setNavOpen(false)}
                    >
                      账号设置
                    </Link>
                    <Link
                      href="/editor"
                      className={styles.mobilePrimaryAction}
                      onClick={() => setNavOpen(false)}
                    >
                      发起共建
                    </Link>
                    <button type="button" onClick={handleLogout} className={styles.mobileGhostAction}>
                      退出登录
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.mobileUserMeta}>
                    <strong className={styles.mobileUserName}>登录后继续</strong>
                    <span className={styles.mobileUserRole}>收藏工具、参与共建和继续对话都会更顺手。</span>
                  </div>
                  <div className={styles.mobileAuthActions}>
                    <Link
                      href="/login"
                      className={styles.mobilePrimaryAction}
                      onClick={() => setNavOpen(false)}
                    >
                      登录
                    </Link>
                    <Link
                      href="/register"
                      className={styles.mobileSecondaryAction}
                      onClick={() => setNavOpen(false)}
                    >
                      注册
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
