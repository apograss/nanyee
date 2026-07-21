// Canvas design runtime editable source marker: home
import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, GraduationCap, BookOpen, ClipboardCheck, Armchair, Users, ArrowRight, Activity } from "lucide-react";
import { Card, CardContent, StatusBadge, Alert } from "@/components/ui.jsx";
import { useAuth } from "@/lib/api.jsx";

const TOOLS = [
  { to: "/tools/timetable", label: "课表查询", desc: "登录学校系统后查看周课表，可导出日历", icon: CalendarDays, accent: "var(--seed-primary)" },
  { to: "/tools/grades", label: "成绩查询", desc: "查看课程成绩、绩点和排名分布", icon: GraduationCap, accent: "var(--seed-success)" },
  { to: "/tools/enrollment", label: "在线选课", desc: "按优先级排队，到点自动抢课", icon: BookOpen, accent: "var(--seed-primary)" },
  { to: "/tools/evaluations", label: "自动评课", desc: "登录后自动完成全部评课，无需逐题填写", icon: ClipboardCheck, accent: "var(--seed-success)" },
  { to: "/tools/study-cabin", label: "学习舱预约", desc: "选好舱位，到点自动帮你抢", icon: Armchair, accent: "var(--seed-warning)" },
  { to: "/tools/qun", label: "群报数", desc: "每日打卡自动提交，支持图片上传", icon: Users, accent: "var(--seed-primary)" },
];

const SUMMARY = [
  { state: "running", title: "自动评课进行中", sub: "正在自动评课", id: "job_001" },
  { state: "verification_required", title: "学习舱预约待核验", sub: "需要手动确认", id: "job_002" },
  { state: "succeeded", title: "自动评课已完成 · 18 门", sub: "评课已完成", id: "job_004" },
];

/* ---- 装饰：首页 hero 背景图案 ---- */
function HeroBgPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]" viewBox="0 0 600 300" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="520" cy="40" r="60" fill="var(--seed-primary)" />
      <circle cx="560" cy="200" r="80" fill="var(--seed-success)" />
      <circle cx="480" cy="260" r="40" fill="var(--seed-primary)" />
      <path d="M0 150 Q100 100 200 150 T400 150" stroke="var(--seed-primary)" stroke-width="2" fill="none" />
      <path d="M350 80 Q450 30 550 80" stroke="var(--seed-success)" stroke-width="2" fill="none" />
    </svg>
  );
}

/* ---- 首页角色：和泉纱雾举牌 ---- */
function HeroCharacter() {
  return (
    <div className="relative" data-character-slot="hero">
      <img
        src="/character.png"
        alt="和泉纱雾举着牌子"
        className="w-full h-auto drop-shadow-[0_6px_20px_color-mix(in_srgb,var(--seed-fg)_10%,transparent)]"
      />
      {/* 牌子文字叠加 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 font-display text-[var(--seed-primary-strong)] font-medium whitespace-nowrap select-none"
        style={{ top: "15.5%", fontSize: "clamp(9px,1.1vw,13px)", letterSpacing: "0.02em" }}
      >
        超高性能的工具~
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6" data-component="HomePage" data-od-id="home">
      {/* Hero 卡片 */}
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-gradient-to-br from-[var(--seed-surface)] via-[var(--seed-bg)] to-[color-mix(in_srgb,var(--seed-accent,var(--seed-primary))_5%,var(--seed-bg))] p-6 sm:p-8" data-component="HeroBanner">
        <HeroBgPattern />
        <div className="relative flex items-center gap-6">
          <div className="flex-1">
            <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">首页</div>
            <h1 className="text-[clamp(1.75rem,1.3rem+1.5vw,2.25rem)] mt-1">你好，{user?.nickname || "同学"}</h1>
            <p className="text-[var(--muted)] text-sm prose-body mt-1.5">课表和成绩用学校账号登录即可查看；选课、评课、学习舱等会到点自动帮你完成。</p>
          </div>
          {/* 角色图片：和泉纱雾举牌 */}
          <div className="hidden sm:flex w-[160px] lg:w-[240px] shrink-0 items-end justify-center self-end" data-character-slot="hero">
            <HeroCharacter />
          </div>
        </div>
      </div>

      {/* 工具卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} data-component="ToolCard" data-od-id={t.to} className="group">
              <Card className="h-full hover:border-[color-mix(in_srgb,var(--seed-primary)_40%,transparent)] hover:shadow-[var(--shadow-md)] transition-all overflow-hidden relative">
                <CardContent className="p-5 flex flex-col gap-3">
                  <div className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${t.accent} 14%, var(--seed-bg))`, color: `color-mix(in srgb, ${t.accent} 85%, var(--seed-fg))` }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium tracking-[0.01em]">{t.label}</div>
                    <div className="text-[13px] text-[var(--muted)] mt-0.5 leading-[1.5]">{t.desc}</div>
                  </div>
                  <div className="text-[13px] inline-flex items-center gap-1 mt-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: `color-mix(in srgb, ${t.accent} 80%, var(--seed-fg))` }}>
                    进入 <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 任务摘要 + 提醒 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-component="TaskSummary" data-od-id="task-summary">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium tracking-[0.01em]"><Activity className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 任务摘要</div>
              <Link to="/jobs" className="text-[13px] text-[var(--seed-primary-strong)] underline underline-offset-2">全部</Link>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {SUMMARY.map((s) => (
                <Link to={`/jobs/${s.id}`} key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <StatusBadge status={s.state} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{s.title}</div>
                    <div className="text-[11px] text-[var(--muted)] tracking-[0.01em]">{s.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="text-sm font-medium tracking-[0.01em]">待办提醒</div>
            <Alert variant="warning" title="学习舱预约待核验">
              <span>有一个学习舱预约需要你手动确认结果，请在任务列表中查看详情。</span>
            </Alert>
            <Alert variant="info" title="自动选课运行中">
              <span>选课正在自动进行中，可随时取消。先连续尝试几轮，之后自动轮询直到成功或超时。</span>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
