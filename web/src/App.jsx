// Canvas design runtime editable source marker: app-root
import React, { useEffect } from "react";
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Home, CalendarDays, GraduationCap, BookOpen, ClipboardCheck, Armchair,
  Users, KeyRound, ListTodo, LogOut, Bell, ShieldCheck,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/api.jsx";
import { Button, Badge, cn } from "@/components/ui.jsx";

import AuthPages from "@/pages/AuthPages.jsx";
import HomePage from "@/pages/Home.jsx";
import Timetable from "@/pages/Timetable.jsx";
import Grades from "@/pages/Grades.jsx";
import Enrollment from "@/pages/Enrollment.jsx";
import Evaluations from "@/pages/Evaluations.jsx";
import StudyCabin from "@/pages/StudyCabin.jsx";
import Qun from "@/pages/Qun.jsx";
import Credentials from "@/pages/Credentials.jsx";
import Jobs from "@/pages/Jobs.jsx";
import JobDetail from "@/pages/JobDetail.jsx";

const NAV = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/tools/timetable", label: "课表", icon: CalendarDays, group: "学校查询" },
  { to: "/tools/grades", label: "成绩", icon: GraduationCap },
  { to: "/tools/enrollment", label: "选课", icon: BookOpen, group: "在线办理" },
  { to: "/tools/evaluations", label: "评课", icon: ClipboardCheck },
  { to: "/tools/study-cabin", label: "学习舱", icon: Armchair, group: "我的中心" },
  { to: "/tools/qun", label: "群报数", icon: Users },
  { to: "/credentials", label: "我的凭据", icon: KeyRound },
  { to: "/jobs", label: "任务列表", icon: ListTodo },
];

function NavItem({ item, onNavigate }) {
  const location = useLocation();
  const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      data-component="NavLink"
      data-od-id={item.to}
      className={cn(
        "group flex items-center gap-3 rounded-[var(--radius)] px-3 h-9 text-sm tracking-[0.01em] transition-colors",
        active ? "bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] font-medium" : "text-[var(--muted)] hover:bg-[var(--seed-surface-2)] hover:text-foreground"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Shell() {
  const { user, clearOnExit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // 401 全局监听：清理内存态并跳登录
  useEffect(() => {
    const onUnauth = () => {
      clearOnExit();
      navigate("/auth/login", { state: { from: location.pathname } });
    };
    window.addEventListener("nanyee:unauth", onUnauth);
    return () => window.removeEventListener("nanyee:unauth", onUnauth);
  }, [clearOnExit, navigate, location.pathname]);

  const currentLabel = [...NAV].reverse().find((n) => location.pathname.startsWith(n.to))?.label || "首页";

  return (
    <div className="min-h-screen flex" data-component="AppShell" data-od-id="shell">
      {/* 侧栏 */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 z-40 h-screen w-[240px] shrink-0 border-r border-border bg-[var(--seed-surface)] flex flex-col transition-transform",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
          <div className="w-9 h-9 rounded-[var(--radius)] bg-gradient-to-br from-[var(--seed-primary)] to-[color-mix(in_srgb,var(--seed-primary)_75%,var(--seed-accent))] text-[var(--primary-foreground)] flex items-center justify-center shadow-sm shrink-0">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M12 8v4M10 10h4" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-display text-[16px] font-semibold tracking-[-0.02em]">南医工具台</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {NAV.map((item, i) => (
            <React.Fragment key={item.to}>
              {item.group && <div className="mt-4 mb-1 px-3 text-[11px] tracking-[0.08em] uppercase text-[color-mix(in_srgb,var(--seed-muted)_70%,transparent)]">{item.group}</div>}
              <NavItem item={item} onNavigate={() => setMobileNavOpen(false)} />
              {i === 1 || i === 4 ? null : null}
            </React.Fragment>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-[var(--radius)]">
            <div className="w-8 h-8 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] flex items-center justify-center text-[13px] font-medium text-[var(--seed-primary-strong)]">
              {user?.nickname?.[0] || "·"}
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[13px] font-medium truncate">{user?.nickname || "未登录"}</div>
              <div className="text-[11px] text-[var(--muted)] truncate">{user?.username ? `@${user.username}` : "平台账号"}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { clearOnExit(); navigate("/auth/login"); }}
              aria-label="退出登录"
              data-component="LogoutButton"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* 移动端遮罩 */}
      {mobileNavOpen && <div className="fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--seed-fg)_30%,transparent)] lg:hidden" onClick={() => setMobileNavOpen(false)} />}

      {/* 主区 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-[color-mix(in_srgb,var(--seed-bg)_88%,transparent)] backdrop-blur flex items-center gap-3 px-4 sm:px-6">
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden -ml-2"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开导航"
          >
            <ListTodo className="w-4 h-4" />
          </Button>
          <h1 className="text-[1.0625rem] font-display tracking-[-0.012em] flex-1 truncate">{currentLabel}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="hidden sm:inline-flex" data-component="VerifyBadge">
              <Bell className="w-3 h-3" /> 待核验 1
            </Badge>
            <Badge variant="muted" className="hidden sm:inline-flex">
              <ShieldCheck className="w-3 h-3" /> 安全登录
            </Badge>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 warm-grain" data-component="PageMain">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="p-10 text-[var(--muted)] text-sm">正在确认登录状态…</div>;
  }
  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="max-w-md mx-auto py-20 text-center">
      <h1 className="text-[2.5rem] mb-2">404</h1>
      <p className="text-[var(--muted)] text-sm mb-6">这个页面不在工具台范围内。</p>
      <Button onClick={() => (window.location.hash = "/")}>返回首页</Button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth/login" element={<AuthPages mode="login" />} />
        <Route path="/auth/register" element={<AuthPages mode="register" />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Shell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tools/timetable" element={<Timetable />} />
            <Route path="/tools/grades" element={<Grades />} />
            <Route path="/tools/enrollment" element={<Enrollment />} />
            <Route path="/tools/evaluations" element={<Evaluations />} />
            <Route path="/tools/study-cabin" element={<StudyCabin />} />
            <Route path="/tools/qun" element={<Qun />} />
            <Route path="/credentials" element={<Credentials />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
