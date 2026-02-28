"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./layout.module.css";

const NAV_ITEMS = [
  { href: "/admin", label: "概览", icon: "📊" },
  { href: "/admin/audit", label: "文章审核", icon: "📝" },
  { href: "/admin/apikey", label: "API Key", icon: "🔑" },
  { href: "/admin/channels", label: "渠道管理", icon: "📡" },
  { href: "/admin/users", label: "用户管理", icon: "👤" },
  { href: "/admin/announcements", label: "公告管理", icon: "📢" },
  { href: "/admin/links", label: "链接管理", icon: "🔗" },
  { href: "/admin/stats", label: "用量统计", icon: "📈" },
  { href: "/admin/logs/requests", label: "请求日志", icon: "📋" },
  { href: "/admin/logs/audit", label: "审计日志", icon: "🔍" },
  { href: "/admin/settings", label: "站点设置", icon: "⚙️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && data.data.user.role === "admin") {
          setRole("admin");
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || role !== "admin") {
    return <div className={styles.loading}>验证权限中...</div>;
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          nanyee.de
        </Link>
        <span className={styles.badge}>Admin</span>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.active : ""}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
