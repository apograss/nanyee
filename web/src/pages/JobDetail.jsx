// Canvas design runtime editable source marker: job-detail
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ExternalLink, Ban, CheckCircle2, RefreshCw, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, StatusBadge, Alert, Badge, Spinner, cn } from "@/components/ui.jsx";
import { getJob, cancelJob, TERMINAL_STATES, isRetryableState, mockJobs } from "@/lib/api.jsx";

function summarize(job) {
  const p = job?.payload || {};
  if (!job) return "";
  if (job.tool_id === "study_cabin" && job.operation === "reserve") {
    return `${p.title || "学习舱预约"} · ${Array.isArray(p.cabin_ids) && p.cabin_ids.length ? `${p.cabin_ids.length} 个舱位` : ""} · ${p.start_time || ""}-${p.end_time || ""}`;
  }
  if (job.tool_id === "evaluation") {
    return `自动评课 · ${p.strategy || "legacy_positive_random"}${p.max_courses ? ` · 上限 ${p.max_courses}` : ""}`;
  }
  if (job.tool_id === "qun_checkin") {
    return `群报数 · ${p.form_id || job.receipt?.title || ""}`;
  }
  return `${job.tool_id}:${job.operation}`;
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 设计预览：从 mockJobs 找一条匹配 id 的，找不到则回退到 mockJobs[1]（verification_required）
      const mock = mockJobs.find((m) => m.id === id) || mockJobs[1];
      const data = await getJob(id, { mock: { ...mock, id: id || mock.id } });
      setJob(data);
    } catch (err) {
      setError(err?.message || "任务加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // 非终态轮询：每 3 秒拉一次，直到进入终态或 verification_required
  useEffect(() => {
    if (!job) return;
    if (TERMINAL_STATES.includes(job.state) || job.state === "verification_required") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (isRetryableState(job.state)) {
      pollRef.current = setInterval(load, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [job, load]);

  const onCancel = async () => {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelJob(id, { mock: { ...job, state: "cancelled", cancel_requested_at: new Date().toISOString() } });
      setJob((j) => ({ ...j, state: "cancelled", cancel_requested_at: new Date().toISOString() }));
    } catch (err) {
      setCancelError(err?.message || "取消失败");
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !job) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-5 py-10" data-component="JobDetailPage" data-od-id="job-detail">
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]"><Spinner /> 加载任务详情…</div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-5" data-component="JobDetailPage" data-od-id="job-detail">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" /> 返回任务列表</Link>
        <Alert variant="warning" title="任务加载失败">{error}</Alert>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> 重试</Button>
      </div>
    );
  }

  const pct = job?.max_attempts ? Math.min(100, Math.round(((job.attempt_count || 0) / job.max_attempts) * 100)) : 0;
  const idx = ["queued", "running", "retry_wait", "verification_required", "succeeded"].indexOf(job.state);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5" data-component="JobDetailPage" data-od-id="job-detail">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-foreground"><ArrowLeft className="w-3.5 h-3.5" /> 返回任务列表</Link>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[1.5rem]">{summarize(job)}</h1>
          <StatusBadge status={job.state} />
        </div>
        <p className="text-[var(--muted)] text-sm prose-body">任务详情</p>
      </div>

      {job.state === "verification_required" && job.next_action && (
        <Alert variant="warning" title="待人工核验 · 禁止自动重试">
          <span className="leading-[1.6]">{job.next_action}</span>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="#nanyee-verify" onClick={(e) => e.preventDefault()}><ExternalLink className="w-3.5 h-3.5" /> 去上游核验</a>
            </Button>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> 我已核验，刷新状态</Button>
          </div>
        </Alert>
      )}

      {job.state === "succeeded" && job.receipt && (
        <Alert variant="success" title="任务已完成">
          <pre className="text-[12px] font-mono whitespace-pre-wrap m-0">{JSON.stringify(job.receipt, null, 2)}</pre>
        </Alert>
      )}

      {job.state === "failed" && job.error_code && (
        <Alert variant="danger" title="任务失败">
          <span>任务未能完成。你可以取消或重新创建一个任务。</span>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>状态进度</CardTitle>
          <CardDescription>任务会自动重试几次，完成后就不能再重新执行。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2" data-component="JobPipeline" data-od-id="pipeline">
            {["queued", "running", "retry_wait", "verification_required", "succeeded"].map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-[var(--radius-full)]", s === job.state ? "bg-[var(--seed-primary)]" : ["queued", "running", "retry_wait", "verification_required", "succeeded"].indexOf(s) < idx ? "bg-[var(--seed-success)]" : "bg-[var(--seed-surface-2)] border border-border")} />
                  <span className={cn("text-[12px]", s === job.state ? "text-[var(--seed-primary-strong)] font-medium" : "text-[var(--muted)]")}>{s === "queued" ? "排队" : s === "running" ? "执行中" : s === "retry_wait" ? "等待重试" : s === "verification_required" ? "待核验" : s === "succeeded" ? "已完成" : s}</span>
                </div>
                {i < 4 && <div className="flex-1 h-px bg-[var(--border)]" />}
              </React.Fragment>
            ))}
          </div>
          {job.max_attempts ? (
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--muted)]">尝试进度</span>
                <span className="font-mono tabular-nums text-foreground">{job.attempt_count || 0} / {job.max_attempts}</span>
              </div>
              <div className="w-full h-2 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
                <div className="h-full bg-[var(--seed-primary)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>任务信息</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-[13px]">
            <Row k="任务 ID"><span className="font-mono text-[12px]">{job.id}</span></Row>
            <Row k="工具"><span>{job.tool_id === "study_cabin" ? "学习舱预约" : job.tool_id === "evaluation" ? "自动评课" : job.tool_id === "qun_checkin" ? "群报数" : job.tool_id}</span></Row>
            {job.confirmation_version && <Row k="确认版本"><span>{job.confirmation_version}</span></Row>}
            <Row k="使用的凭据"><span className="font-mono text-[12px]">{job.credential_id}</span></Row>
            {job.scheduled_for && <Row k="计划执行"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-[var(--muted)]" /> {new Date(job.scheduled_for).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></Row>}
            <Row k="尝试次数"><span className="tabular-nums">{job.attempt_count || 0}{job.max_attempts ? ` / ${job.max_attempts}` : ""}</span></Row>
            <Row k="创建时间"><span>{new Date(job.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></Row>
            <Row k="最近更新"><span>{job.updated_at ? new Date(job.updated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"}</span></Row>
            {job.cancel_requested_at && <Row k="取消请求"><span className="text-[var(--warning)]">{new Date(job.cancel_requested_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></Row>}
            {job.next_action && <Row k="需要你处理"><span className="text-[var(--warning)]">{job.next_action}</span></Row>}
          </dl>
        </CardContent>
      </Card>

      <Card data-component="PayloadCard" data-od-id="payload">
        <CardHeader>
          <CardTitle>任务参数</CardTitle>
          <CardDescription>任务的输入参数，不含任何密码或敏感信息。</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-[12px] font-mono bg-[var(--seed-surface-2)] rounded-[var(--radius)] p-4 overflow-x-auto leading-[1.6]">{JSON.stringify(job.payload, null, 2)}</pre>
        </CardContent>
      </Card>

      {cancelError && <Alert variant="warning" title="取消失败">{cancelError}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate("/jobs")}><ArrowLeft className="w-4 h-4" /> 返回列表</Button>
        <Button variant="ghost" onClick={load} loading={loading}><RefreshCw className="w-4 h-4" /> 刷新</Button>
        {!TERMINAL_STATES.includes(job.state) && job.state !== "verification_required" && (
          <Button variant="danger" onClick={onCancel} loading={cancelling}><Ban className="w-4 h-4" /> 取消任务</Button>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] tracking-[0.08em] uppercase text-[var(--muted)]">{k}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
