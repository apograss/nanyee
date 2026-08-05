// Canvas design runtime editable source marker: jobs
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ListTodo, AlertTriangle, Search, RefreshCw, ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, StatusBadge, EmptyState, Badge, Spinner, cn } from "@/components/ui.jsx";
import { listJobs, TERMINAL_STATES } from "@/lib/api.jsx";

const EASE = [0.22, 1, 0.36, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "verify", label: "待核验" },
  { key: "done", label: "已完成" },
  { key: "failed", label: "失败" },
];

function matchFilter(state, key) {
  if (key === "all") return true;
  if (key === "active") return ["queued", "running", "retry_wait"].includes(state);
  if (key === "verify") return state === "verification_required";
  if (key === "done") return state === "succeeded";
  if (key === "failed") return state === "failed";
  return true;
}

// 根据任务 payload 与 receipt 摘要一行人类可读文案
function summarize(job) {
  const p = job.payload || {};
  if (job.tool_id === "study_cabin" && job.operation === "reserve") {
    const cabins = Array.isArray(p.cabin_ids) && p.cabin_ids.length ? `${p.cabin_ids.length} 个舱位` : "学习舱";
    return `${p.title || "预约"} · ${cabins} · ${p.start_time || ""}-${p.end_time || ""}`;
  }
  if (job.tool_id === "evaluation") {
    if (job.receipt?.courses_evaluated) return `已评 ${job.receipt.courses_evaluated} 门 · ${p.strategy || ""}`;
    return `自动评课 · ${p.strategy || "legacy_positive_random"}${p.max_courses ? ` · 上限 ${p.max_courses}` : ""}`;
  }
  if (job.tool_id === "qun_checkin") {
    return job.receipt?.title ? `${job.receipt.title} · 已提交` : `群报数 · ${p.form_id || ""}`;
  }
  return `${job.tool_id}:${job.operation}`;
}

export default function Jobs() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs();
      const arr = Array.isArray(data) ? data : (data?.items || []);
      setJobs(arr);
    } catch (err) {
      setError(err?.message || "任务列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = jobs.filter((j) => matchFilter(j.state, filter) && (q === "" || j.id.includes(q) || String(j.tool_id).includes(q) || summarize(j).includes(q)));

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6" data-component="JobsPage" data-od-id="jobs">
      {/* ---------- 编辑风区块头 ---------- */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
        <motion.div variants={fadeUp} className="flex items-center gap-4">
          <span className="kicker"><strong>Jobs</strong> — 凭据与任务</span>
          <span className="rule-line flex-1" />
        </motion.div>
        <motion.h1 variants={fadeUp} className="display-lede">任务中心</motion.h1>
        <motion.p variants={fadeUp} className="text-[var(--muted)] text-sm prose-body">在这里查看你的所有任务：排队、执行、重试、完成或失败。需要你手动确认的任务会单独标出。</motion.p>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="kicker"><strong>Queue</strong> — 任务队列</div>
              <CardTitle>任务列表</CardTitle>
              <CardDescription>同一任务不会重复创建。列表会显示当前尝试次数和需要你处理的事项。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="按 ID / 工具 / 摘要" className="pl-8 w-[200px]" />
              </div>
              <Button variant="ghost" size="icon" onClick={load} disabled={loading} aria-label="刷新任务列表"><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5" data-component="JobFilters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn("px-3 h-8 rounded-[var(--radius-full)] text-[13px] tracking-[0.01em] border transition-colors", filter === f.key ? "border-[var(--seed-primary)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] font-medium" : "border-border text-[var(--muted)] hover:text-foreground")}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--muted)] py-6"><Spinner /> 加载任务列表…</div>
            ) : error ? (
              <EmptyState icon={AlertTriangle} title="加载失败" description={error} action={<Button variant="outline" size="sm" onClick={load}>重试</Button>} />
            ) : list.length === 0 ? (
              <EmptyState icon={ListTodo} title="没有匹配的任务" description="尝试切换筛选或清空搜索。" />
            ) : (
              <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col divide-y divide-border">
                {list.map((j) => {
                  const pct = j.max_attempts ? Math.min(100, Math.round((j.attempt_count / j.max_attempts) * 100)) : 0;
                  return (
                    <motion.div key={j.id} variants={fadeUp} className="py-3 first:pt-0 last:pb-0">
                      <Link to={`/jobs/${j.id}`} className="group flex items-center gap-3 hover:bg-[var(--seed-surface-2)] -mx-2 px-2 py-1.5 rounded-[var(--radius-sm)] no-underline" data-component="JobRow" data-od-id={j.id}>
                        <StatusBadge status={j.state} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate text-foreground group-hover:text-[var(--seed-primary-strong)] transition-colors">{summarize(j)}</div>
                          <div className="text-[11px] text-[var(--muted)] font-mono mt-0.5">{j.id} · {j.tool_id === "study_cabin" ? "学习舱预约" : j.tool_id === "evaluation" ? "自动评课" : j.tool_id === "qun_checkin" ? "群报数" : j.tool_id}{j.attempt_count != null && j.max_attempts ? ` · 第 ${j.attempt_count} 次，最多 ${j.max_attempts} 次` : ""}</div>
                          {j.state === "verification_required" && j.next_action && (
                            <div className="text-[11px] text-[var(--warning)] mt-1 flex items-center gap-1 truncate"><AlertTriangle className="w-3 h-3 shrink-0" /> {j.next_action}</div>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] text-right shrink-0 flex flex-col items-end gap-1">
                          <span>{j.scheduled_for ? new Date(j.scheduled_for).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                          {j.state === "verification_required" && <Badge variant="warning"><AlertTriangle className="w-3 h-3" /> 需核验</Badge>}
                          {!TERMINAL_STATES.includes(j.state) && j.max_attempts ? (
                            <div className="w-[80px] h-1 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
                              <div className="h-full bg-[var(--seed-primary)]" style={{ width: `${pct}%` }} />
                            </div>
                          ) : null}
                        </div>
                        <ArrowUpRight className="w-4 h-4 shrink-0 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
