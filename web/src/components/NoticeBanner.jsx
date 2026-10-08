// 全局通知横幅：由 GET /notices 按任务状态实时计算；可关闭的通知按 id 记在 localStorage
import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertOctagon, CheckCircle2, Layers, X, KeyRound, ArrowRight } from "lucide-react";
import { Button, cn } from "@/components/ui.jsx";
import { listNotices } from "@/lib/api.jsx";

const DISMISSED_KEY = "nanyee:dismissed-notices";
export const NOTICES_REFRESH_EVENT = "nanyee:notices-refresh";

function loadDismissed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const KIND_META = {
  credential_invalid: {
    icon: AlertOctagon,
    cls: "border-[var(--danger)] bg-[var(--danger-muted)]",
    bar: "bg-[var(--danger)]",
    iconCls: "text-[var(--danger)]",
  },
  evaluation_recovered: {
    icon: CheckCircle2,
    cls: "border-[color-mix(in_srgb,var(--seed-success)_60%,transparent)] bg-[var(--success-muted)]",
    bar: "bg-[var(--success)]",
    iconCls: "text-[var(--success)]",
  },
  duplicates_merged: {
    icon: Layers,
    cls: "border-[color-mix(in_srgb,var(--seed-primary)_55%,transparent)] bg-[var(--primary-muted)]",
    bar: "bg-[var(--seed-primary)]",
    iconCls: "text-[var(--seed-primary-strong)]",
  },
};

export default function NoticeBanner({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [notices, setNotices] = useState([]);
  const [dismissed, setDismissed] = useState(loadDismissed);

  const refresh = useCallback(() => {
    if (!user) { setNotices([]); return; }
    listNotices({ silent401: true })
      .then((data) => setNotices(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [user]);

  // 切换页面时刷新一次，改完密码回到其他页面能立即看到最新状态
  useEffect(refresh, [refresh, location.pathname]);
  useEffect(() => {
    window.addEventListener(NOTICES_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(NOTICES_REFRESH_EVENT, refresh);
  }, [refresh]);

  const dismiss = (id) => {
    const next = [...dismissed.filter((item) => item !== id), id].slice(-50);
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* 隐私模式下忽略 */ }
  };

  const visible = notices.filter((n) => !n.dismissible || !dismissed.includes(n.id));
  if (!visible.length) return null;

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-3 mb-6" data-component="NoticeBanner">
      <AnimatePresence initial={false}>
        {visible.map((notice) => {
          const meta = KIND_META[notice.kind] || KIND_META.duplicates_merged;
          const Icon = meta.icon;
          return (
            <motion.div
              key={notice.id}
              layout
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: -12 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn("relative overflow-hidden rounded-[var(--radius)] border-2 shadow-sm", meta.cls)}
              role={notice.level === "danger" ? "alert" : "status"}
            >
              <span className={cn("absolute left-0 top-0 bottom-0 w-1.5", meta.bar)} />
              <div className="flex gap-4 p-4 pl-6 sm:p-5 sm:pl-7">
                <Icon className={cn("w-6 h-6 shrink-0 mt-0.5", meta.iconCls)} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold tracking-[0.01em] text-foreground">{notice.title}</div>
                  <p className="mt-1 text-[13.5px] leading-[1.6] text-[var(--muted)]">{notice.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {notice.kind === "credential_invalid" && (
                      notice.credential_id ? (
                        <Button size="sm" onClick={() => navigate(`/credentials?edit=${notice.credential_id}`)}>
                          <KeyRound className="w-3.5 h-3.5" /> 去修改学校密码
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => navigate("/tools/evaluations")}>
                          <ArrowRight className="w-3.5 h-3.5" /> 重新开始自动评课
                        </Button>
                      )
                    )}
                    {notice.job_id && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/jobs/${notice.job_id}`)}>
                        {notice.kind === "duplicates_merged" ? "查看保留的任务" : "查看任务"}
                      </Button>
                    )}
                    {notice.dismissible && (
                      <Button size="sm" variant="ghost" onClick={() => dismiss(notice.id)}>知道了</Button>
                    )}
                  </div>
                </div>
                {notice.dismissible && (
                  <button
                    type="button"
                    onClick={() => dismiss(notice.id)}
                    className="self-start -mr-1 -mt-1 p-1 rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-foreground hover:bg-[color-mix(in_srgb,var(--seed-fg)_8%,transparent)]"
                    aria-label="关闭通知"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
