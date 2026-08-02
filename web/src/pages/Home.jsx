// Canvas design runtime editable source marker: home
import React from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";
import {
  CalendarDays, GraduationCap, BookOpen, ClipboardCheck, Armchair, Users,
  ArrowRight, ArrowUpRight, Activity, Asterisk,
} from "lucide-react";
import { StatusBadge, Alert } from "@/components/ui.jsx";
import { useAuth } from "@/lib/api.jsx";

const TOOLS = [
  { to: "/tools/timetable", label: "课表查询", en: "Timetable", desc: "登录学校系统后查看周课表，可导出日历", icon: CalendarDays },
  { to: "/tools/grades", label: "成绩查询", en: "Grades", desc: "查看课程成绩、绩点和排名分布", icon: GraduationCap },
  { to: "/tools/enrollment", label: "在线选课", en: "Enrollment", desc: "按优先级排队，到点自动抢课", icon: BookOpen },
  { to: "/tools/evaluations", label: "自动评课", en: "Evaluations", desc: "登录后自动完成全部评课，无需逐题填写", icon: ClipboardCheck },
  { to: "/tools/study-cabin", label: "学习舱预约", en: "Study Cabin", desc: "选好舱位，到点自动帮你抢", icon: Armchair },
  { to: "/tools/qun", label: "群报数", en: "Check-in", desc: "每日打卡自动提交，支持图片上传", icon: Users },
];

const SUMMARY = [
  { state: "running", title: "自动评课进行中", sub: "正在自动评课", id: "job_001" },
  { state: "verification_required", title: "学习舱预约待核验", sub: "需要手动确认", id: "job_002" },
  { state: "succeeded", title: "自动评课已完成 · 18 门", sub: "评课已完成", id: "job_004" },
];

const FACTS = [
  { n: "06", label: "校园工具" },
  { n: "24h", label: "任务自动执行" },
  { n: "AES-256-GCM", label: "凭据信封加密" },
];

const EASE = [0.22, 1, 0.36, 1];

const lineReveal = {
  hidden: { y: "112%" },
  show: (i) => ({ y: "0%", transition: { duration: 0.9, ease: EASE, delay: 0.1 + i * 0.1 } }),
};
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/* ---- Hero 右侧抽象编辑构图：拱形 / 轨道环 / 准线 ---- */
function HeroArt() {
  return (
    <div className="relative w-full max-w-[460px] aspect-square mx-auto" aria-hidden="true">
      {/* 准线 */}
      <div className="absolute left-0 right-0 top-1/2 rule-dotted opacity-70" />
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[image:linear-gradient(to_bottom,var(--border)_45%,transparent_45%)] bg-[length:1px_8px] opacity-70" />
      {/* 后层拱形轮廓（鼠尾草绿，偏移） */}
      <motion.div
        initial={{ opacity: 0, y: 56 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.35 }}
        className="absolute left-[8%] top-[18%] w-[62%] aspect-square rounded-t-full border border-[color-mix(in_srgb,var(--seed-success)_40%,transparent)]"
      />
      {/* 主拱形 */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
        className="absolute left-[22%] top-[8%] w-[68%] aspect-square rounded-t-full border border-[color-mix(in_srgb,var(--seed-primary)_55%,transparent)] bg-gradient-to-b from-[color-mix(in_srgb,var(--seed-primary)_24%,var(--seed-bg))] via-[color-mix(in_srgb,var(--seed-primary)_10%,var(--seed-bg))] to-transparent"
      />
      {/* 轨道环 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: EASE, delay: 0.45 }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] aspect-square"
      >
        <div className="w-full h-full rounded-full border border-dashed border-[color-mix(in_srgb,var(--seed-muted)_50%,transparent)] animate-[spin_46s_linear_infinite]">
          <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[var(--seed-primary)]" />
          <div className="absolute top-1/2 -right-[4px] -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--seed-success)]" />
          <div className="absolute bottom-[8%] left-[12%] w-1.5 h-1.5 rounded-full bg-[var(--seed-warning)]" />
        </div>
      </motion.div>
      {/* 内圆 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.6 }}
        className="absolute left-[14%] bottom-[14%] w-[19%] aspect-square rounded-full bg-[color-mix(in_srgb,var(--seed-success)_28%,var(--seed-bg))] border border-[color-mix(in_srgb,var(--seed-success)_45%,transparent)]"
      />
      {/* 十字标记 */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.75 }}>
        <svg className="absolute right-[6%] bottom-[22%] w-3.5 h-3.5 text-[var(--seed-muted)]" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 0v14M0 7h14" /></svg>
        <svg className="absolute left-[4%] top-[12%] w-3 h-3 text-[var(--seed-muted)] opacity-70" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 0v14M0 7h14" /></svg>
      </motion.div>
      {/* 图注 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="absolute right-[2%] top-[6%] text-right"
      >
        <div className="kicker">Fig. 01</div>
        <div className="accent-en text-[15px] mt-1">automation</div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.9 }}
        className="absolute left-[2%] bottom-[5%] kicker"
      >
        N°06 — Tools
      </motion.div>
    </div>
  );
}

/* ---- Marquee 分隔带 ---- */
function MarqueeStrip() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="marquee border-y border-border py-3.5 overflow-hidden select-none"
      aria-hidden="true"
    >
      <div className="marquee-track">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center shrink-0">
            {TOOLS.map((t) => (
              <span key={`${dup}-${t.en}`} className="flex items-center gap-3 px-6 whitespace-nowrap">
                <span className="kicker !text-[12px]">{t.en}</span>
                <span className="text-[12px] text-[var(--muted)]">{t.label}</span>
                <Asterisk className="w-3.5 h-3.5 text-[var(--seed-primary)]" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  /* 鼠标视差：构图跟手，标题反向轻移 */
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18 });
  const sy = useSpring(my, { stiffness: 55, damping: 18 });
  const artX = useTransform(sx, (v) => v * 18);
  const artY = useTransform(sy, (v) => v * 14);
  const headX = useTransform(sx, (v) => v * -7);
  const headY = useTransform(sy, (v) => v * -5);

  const onHeroMove = (e) => {
    if (reduceMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onHeroLeave = () => { mx.set(0); my.set(0); };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-14 sm:gap-20 pb-6" data-component="HomePage" data-od-id="home">
      {/* ---------- 叙事式 Hero ---------- */}
      <section
        className="relative pt-6 sm:pt-10"
        data-component="HeroBanner"
        onMouseMove={onHeroMove}
        onMouseLeave={onHeroLeave}
      >
        <div className="grain-overlay rounded-[var(--radius-lg)]" />
        {/* 背景巨字 */}
        <div
          className="absolute -bottom-4 right-0 font-display font-bold text-[clamp(5rem,15vw,12.5rem)] leading-[0.85] tracking-[-0.04em] text-outline select-none pointer-events-none"
          aria-hidden="true"
        >
          NANYEE
        </div>
        {/* kicker 行 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="relative flex items-center gap-4"
        >
          <span className="kicker"><strong>Nanyee Toolkit</strong></span>
          <span className="rule-line flex-1" />
          <span className="kicker hidden sm:block">{today}</span>
        </motion.div>

        <div className="relative mt-8 sm:mt-12 grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-10 items-center">
          <motion.div style={{ x: headX, y: headY }}>
            <h1 className="display-hero">
              <span className="block overflow-hidden pb-1">
                <motion.span className="block" variants={lineReveal} custom={0} initial="hidden" animate="show">
                  把琐事交给<span className="text-outline-strong">机器</span>，
                </motion.span>
              </span>
              <span className="block overflow-hidden pb-2">
                <motion.span className="block" variants={lineReveal} custom={1} initial="hidden" animate="show">
                  把时间还给<span className="text-[var(--seed-primary)]">学习</span>。
                </motion.span>
              </span>
            </h1>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.5 }}
              className="mt-6 text-[15px] text-[var(--muted)] prose-body"
            >
              你好，{user?.nickname || "同学"}。课表和成绩用学校账号登录即可查看；
              选课、评课、学习舱预约与群报数打卡，都会到点自动替你完成。
              <span className="accent-en ml-2">automate the boring.</span>
            </motion.p>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              transition={{ delay: 0.62 }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              <Link
                to="/tools/timetable"
                className="group inline-flex h-12 items-center gap-2.5 rounded-[var(--radius-full)] bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] no-underline"
                data-component="HeroCTA"
              >
                开始使用
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/jobs"
                className="inline-flex h-12 items-center gap-2 text-[15px] font-medium text-foreground underline decoration-[color-mix(in_srgb,var(--seed-primary)_50%,transparent)] underline-offset-8 hover:decoration-[var(--seed-primary)] no-underline hover:text-[var(--seed-primary-strong)] transition-colors"
              >
                查看任务列表
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>

          <motion.div className="hidden lg:block" style={{ x: artX, y: artY }}>
            <HeroArt />
          </motion.div>
        </div>

        {/* 事实条 */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 border-t border-border"
        >
          {FACTS.map((f) => (
            <motion.div key={f.label} variants={fadeUp} className="flex items-baseline gap-3 py-4 sm:py-5 sm:px-6 sm:first:pl-0 border-b sm:border-b-0 border-border last:border-b-0">
              <span className="font-display text-[1.375rem] font-semibold tracking-[-0.01em]">{f.n}</span>
              <span className="kicker">{f.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ---------- Marquee 分隔带 ---------- */}
      <MarqueeStrip />

      {/* ---------- 工具索引 ---------- */}
      <section data-component="ToolIndex">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          <motion.div variants={fadeUp} className="flex items-end justify-between gap-6 mb-2">
            <div>
              <div className="kicker"><strong>Tool Index</strong> — 工具索引</div>
              <h2 className="display-lede mt-3">六件趁手的工具</h2>
            </div>
            <div className="kicker hidden sm:block">01 — 06</div>
          </motion.div>

          <div className="border-t border-border">
            {TOOLS.map((t, i) => {
              const Icon = t.icon;
              return (
                <motion.div key={t.to} variants={fadeUp}>
                  <Link
                    to={t.to}
                    data-component="ToolCard"
                    data-od-id={t.to}
                    className="index-row group grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-8 py-5 sm:py-6 px-2 sm:px-4 border-b border-border no-underline"
                  >
                    <span className="accent-en text-[22px] w-9 leading-none">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
                      <span className="font-display text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-semibold tracking-[-0.02em] text-foreground">
                        {t.label}
                      </span>
                      <span className="accent-en text-[13px] hidden sm:inline group-hover:text-[var(--seed-primary-strong)] transition-colors">{t.en}</span>
                      <span className="hidden md:inline text-[13px] text-[var(--muted)] truncate">{t.desc}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Icon className="w-[18px] h-[18px] text-[var(--muted)] group-hover:text-[var(--seed-primary-strong)] transition-colors" />
                      <ArrowRight className="index-arrow w-5 h-5 text-[var(--muted)]" />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ---------- 进行中的事务（深色反转区块） ---------- */}
      <section data-component="TaskSummary" data-od-id="task-summary">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="ink-panel relative rounded-[var(--radius-lg)] overflow-hidden"
        >
          <div className="grain-overlay" />
          <div className="relative p-6 sm:p-8">
            <motion.div variants={fadeUp} className="flex items-end justify-between gap-6 mb-6">
              <div>
                <div className="kicker"><strong>Ongoing</strong> — 进行中的事务</div>
                <h2 className="display-lede mt-3">任务与提醒</h2>
              </div>
              <Link to="/jobs" className="kicker inline-flex items-center gap-1.5 text-[var(--seed-muted)] hover:text-[var(--seed-primary-strong)] transition-colors no-underline">
                全部任务 <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--border)] border border-border rounded-[var(--radius)] overflow-hidden">
              <motion.div variants={fadeUp} className="bg-card p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-medium tracking-[0.01em] mb-4">
                  <Activity className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 任务摘要
                </div>
                <div className="flex flex-col divide-y divide-border">
                  {SUMMARY.map((s) => (
                    <Link to={`/jobs/${s.id}`} key={s.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0 no-underline group">
                      <StatusBadge status={s.state} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate text-foreground group-hover:text-[var(--seed-primary-strong)] transition-colors">{s.title}</div>
                        <div className="text-[11px] text-[var(--muted)] tracking-[0.01em]">{s.sub}</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="bg-card p-5 sm:p-6 flex flex-col gap-3">
                <div className="text-sm font-medium tracking-[0.01em] mb-1">待办提醒</div>
                <Alert variant="warning" title="学习舱预约待核验">
                  <span>有一个学习舱预约需要你手动确认结果，请在任务列表中查看详情。</span>
                </Alert>
                <Alert variant="info" title="自动选课运行中">
                  <span>选课正在自动进行中，可随时取消。先连续尝试几轮，之后自动轮询直到成功或超时。</span>
                </Alert>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ---------- 页脚签条 ---------- */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="flex items-center gap-4 pb-2"
      >
        <span className="rule-line flex-1" />
        <span className="kicker">Nanyee — <span className="accent-en normal-case tracking-normal text-[13px]">made for students</span></span>
        <span className="rule-line flex-1" />
      </motion.footer>
    </div>
  );
}
