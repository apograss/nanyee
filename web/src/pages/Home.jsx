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

/* ---- 装饰：首页角色立绘占位 ----
   以后替换为二次元角色立绘（建议 360×420，透明背景 PNG）。
   目前用 SVG 画一个白大褂学生形象作为占位。               */
function HeroCharacter() {
  return (
    <svg viewBox="0 0 200 280" fill="none" className="w-full h-full max-w-[240px]" aria-hidden="true">
      {/* 光环 */}
      <circle cx="100" cy="70" r="48" fill="color-mix(in srgb, var(--seed-primary) 10%, transparent)" />
      <circle cx="100" cy="70" r="38" fill="color-mix(in srgb, var(--seed-primary) 6%, transparent)" />
      {/* 头发后 */}
      <path d="M55 72 Q52 38 100 35 Q148 38 145 72 L145 105 Q145 110 140 110 L60 110 Q55 110 55 105 Z" fill="var(--seed-primary)" opacity="0.82" />
      {/* 脸 */}
      <ellipse cx="100" cy="78" rx="30" ry="33" fill="#fff2e5" />
      {/* 刘海 */}
      <path d="M72 62 Q80 52 95 54 Q88 58 86 66 Q82 60 72 62Z" fill="var(--seed-primary)" opacity="0.82" />
      <path d="M128 62 Q120 52 105 54 Q112 58 114 66 Q118 60 128 62Z" fill="var(--seed-primary)" opacity="0.82" />
      {/* 眼睛 */}
      <circle cx="89" cy="80" r="2.8" fill="var(--seed-fg)" />
      <circle cx="111" cy="80" r="2.8" fill="var(--seed-fg)" />
      <circle cx="90" cy="79" r="0.9" fill="#fff" />
      <circle cx="112" cy="79" r="0.9" fill="#fff" />
      {/* 腮红 */}
      <ellipse cx="83" cy="90" rx="5" ry="3" fill="color-mix(in srgb, var(--seed-primary) 20%, transparent)" />
      <ellipse cx="117" cy="90" rx="5" ry="3" fill="color-mix(in srgb, var(--seed-primary) 20%, transparent)" />
      {/* 微笑 */}
      <path d="M93 92 Q100 97 107 92" stroke="var(--seed-fg)" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.6" />
      {/* 白大褂身体 */}
      <path d="M58 112 L55 230 Q55 240 65 240 L135 240 Q145 240 145 230 L142 112 Z" fill="#fffbf5" stroke="var(--seed-border)" stroke-width="1.5" />
      {/* 领口 V 字 */}
      <path d="M88 112 L100 138 L112 112" stroke="var(--seed-primary)" stroke-width="2.5" stroke-linecap="round" fill="none" />
      {/* 内搭 */}
      <path d="M88 112 L100 138 L112 112 L108 112 L100 128 L92 112 Z" fill="color-mix(in srgb, var(--seed-success) 15%, var(--seed-bg))" />
      {/* 医学十字胸章 */}
      <g transform="translate(100, 168)">
        <rect x="-3.5" y="-11" width="7" height="22" rx="1.5" fill="var(--seed-primary)" opacity="0.75" />
        <rect x="-11" y="-3.5" width="22" height="7" rx="1.5" fill="var(--seed-primary)" opacity="0.75" />
      </g>
      {/* 口袋 */}
      <rect x="118" y="175" width="18" height="20" rx="2" fill="none" stroke="var(--seed-border)" stroke-width="1.2" opacity="0.7" />
      {/* 手臂 */}
      <path d="M58 116 Q46 155 52 195" fill="none" stroke="var(--seed-border)" stroke-width="1.5" />
      <path d="M142 116 Q154 155 148 195" fill="none" stroke="var(--seed-border)" stroke-width="1.5" />
      {/* 书本 */}
      <rect x="68" y="178" width="64" height="26" rx="3" fill="var(--seed-surface-2)" stroke="var(--seed-border)" stroke-width="1" />
      <line x1="100" y1="178" x2="100" y2="204" stroke="var(--seed-border)" stroke-width="1" />
      <rect x="72" y="184" width="22" height="2" rx="1" fill="var(--seed-border)" opacity="0.6" />
      <rect x="72" y="190" width="18" height="2" rx="1" fill="var(--seed-border)" opacity="0.4" />
      <rect x="106" y="184" width="22" height="2" rx="1" fill="var(--seed-border)" opacity="0.6" />
      <rect x="106" y="190" width="18" height="2" rx="1" fill="var(--seed-border)" opacity="0.4" />
      {/* 闪光装饰 */}
      <g opacity="0.55">
        <path d="M168 45 L170 50 L175 52 L170 54 L168 59 L166 54 L161 52 L166 50 Z" fill="var(--seed-primary)" />
        <path d="M28 110 L29.5 114 L33.5 115.5 L29.5 117 L28 121 L26.5 117 L22.5 115.5 L26.5 114 Z" fill="var(--seed-success)" />
        <path d="M175 200 L176.5 204 L180.5 205.5 L176.5 207 L175 211 L173.5 207 L169.5 205.5 L173.5 204 Z" fill="var(--seed-warning)" />
        <circle cx="40" cy="45" r="2" fill="var(--seed-primary)" opacity="0.5" />
        <circle cx="165" cy="130" r="2.5" fill="var(--seed-success)" opacity="0.5" />
      </g>
    </svg>
  );
}

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
          {/* 角色立绘图位 —— 以后替换为二次元立绘 PNG */}
          <div className="hidden sm:flex w-[140px] lg:w-[200px] shrink-0 items-end justify-center self-end" data-character-slot="hero">
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
