export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
  external?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "概览", icon: "📊" },
  { href: "/admin/articles", label: "Wiki 管理", icon: "📚" },
  { href: "/admin/wiki-categories", label: "Wiki 分类", icon: "🗂️" },
  { href: "/admin/guestbook", label: "留言管理", icon: "📨" },
  { href: "/admin/bbs", label: "论坛管理", icon: "🗣️" },
  { href: "/admin/tools", label: "工具管理", icon: "🛠️" },
  { href: "/admin/users", label: "用户管理", icon: "👥" },
  { href: "/admin/announcements", label: "公告管理", icon: "📙" },
  { href: "/admin/links", label: "链接管理", icon: "🔆" },
  { href: "/admin/stats", label: "用量统计", icon: "📱" },
  { href: "/admin/logs/requests", label: "请求日志", icon: "📵" },
  { href: "/admin/logs/audit", label: "审计日志", icon: "📳" },
  { href: "/admin/settings", label: "站点设置", icon: "⚙️" },
  { href: "/admin/appearance", label: "外观设置", icon: "🎹" },
];

export interface AdminDashboardStats {
  totalUsers: number;
  totalArticles: number;
  totalSearches: number;
  totalToolRuns: number;
}

export const ADMIN_DASHBOARD_CARDS: Array<{
  key: keyof AdminDashboardStats;
  label: string;
}> = [
  { key: "totalUsers", label: "用户总数" },
  { key: "totalArticles", label: "文章数" },
  { key: "totalSearches", label: "AI 搜索次数" },
  { key: "totalToolRuns", label: "工具调用" },
];
