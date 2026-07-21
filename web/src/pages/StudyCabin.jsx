// Canvas design runtime editable source marker: study-cabin
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, ArrowRight, GripVertical, Clock, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, StatusBadge, Spinner, cn } from "@/components/ui.jsx";
import {
  fetchStudyCabins, listCredentials, createCredential, createJob,
  CONFIRMATION_VERSIONS, CREDENTIAL_PURPOSES,
  mockStudyCabins, mockCredentials, mockJobs,
} from "@/lib/api.jsx";

export default function StudyCabin() {
  const navigate = useNavigate();
  const purpose = CREDENTIAL_PURPOSES.find((p) => p.purpose === "study_cabin");

  // 舱位列表（来自 GET /study-cabin/cabins）
  const [cabins, setCabins] = useState([]);
  const [cabinsLoading, setCabinsLoading] = useState(true);
  const [cabinsError, setCabinsError] = useState(null);

  // 已托管的学习舱凭据（purpose=study_cabin, status=active）
  const [credential, setCredential] = useState(null);
  const [credLoading, setCredLoading] = useState(true);

  // 创建凭据表单
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState(""); // 敏感态：仅内存，提交后清空
  const [accountHint, setAccountHint] = useState("");
  const [ttl, setTtl] = useState(604800); // 默认 7 天
  const [creatingCred, setCreatingCred] = useState(false);
  const [credError, setCredError] = useState(null);

  // 预约表单
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("21:00");
  const [attemptUntil, setAttemptUntil] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [selected, setSelected] = useState([]); // dev_id[] 按优先级

  // 任务提交
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitResult, setSubmitResult] = useState(null); // { job_id, state, next_action }

  const loadCabins = useCallback(async () => {
    setCabinsLoading(true);
    setCabinsError(null);
    try {
      const data = await fetchStudyCabins({ mock: mockStudyCabins });
      setCabins(Array.isArray(data) ? data : []);
    } catch (err) {
      setCabinsError(err?.message || "舱位列表加载失败");
    } finally {
      setCabinsLoading(false);
    }
  }, []);

  const loadCredential = useCallback(async () => {
    setCredLoading(true);
    try {
      const list = await listCredentials({ mock: mockCredentials });
      const arr = Array.isArray(list) ? list : (list?.items || []);
      const active = arr.find((c) => c.purpose === "study_cabin" && c.status === "active");
      setCredential(active || null);
    } catch {
      setCredential(null);
    } finally {
      setCredLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCabins();
    loadCredential();
  }, [loadCabins, loadCredential]);

  const toggleCabin = (devId) => setSelected((prev) => {
    const id = Number(devId);
    return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
  });

  const moveCabin = (idx, dir) => setSelected((prev) => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const createStudyCred = async (e) => {
    e?.preventDefault();
    setCredError(null);
    setCreatingCred(true);
    try {
      const secret = JSON.stringify({ account, password });
      const cred = await createCredential({
        upstream: purpose.upstream,
        purpose: purpose.purpose,
        secret,
        consent_version: CONFIRMATION_VERSIONS.credentialHosting,
        ttl_seconds: ttl,
        metadata: { account_hint: accountHint || `尾号 ${account.slice(-4)}` },
      }, { mock: { id: "cred_cabin_new", upstream: purpose.upstream, purpose: purpose.purpose, status: "active", expires_at: new Date(Date.now() + ttl * 1000).toISOString(), created_at: new Date().toISOString(), last_used_at: null, metadata: { account_hint: accountHint || `尾号 ${account.slice(-4)}` }, consent_version: CONFIRMATION_VERSIONS.credentialHosting } });
      setCredential(cred);
      setPassword(""); // 提交即清空
    } catch (err) {
      setCredError(err?.message || "凭据创建失败");
    } finally {
      setCreatingCred(false);
    }
  };

  const valid = title.length >= 1 && title.length <= 30 && targetDate && startTime && endTime && selected.length > 0 && credential;

  const submit = async () => {
    setSubmitError(null);
    setSubmitResult(null);
    setSubmitting(true);
    try {
      const payload = {
        target_date: targetDate,
        start_time: startTime,
        end_time: endTime,
        title,
        cabin_ids: selected, // 按用户优先级排序的 dev_id 列表
      };
      if (attemptUntil) payload.attempt_until = attemptUntil;

      const body = {
        tool_id: "study_cabin",
        operation: "reserve",
        credential_id: credential.id,
        confirmation_version: CONFIRMATION_VERSIONS.studyCabinJob,
        payload,
      };
      if (scheduledFor) body.scheduled_for = scheduledFor;

      const job = await createJob(body, { mock: mockJobs[1] });
      setSubmitResult({ job_id: job.id, state: job.state, next_action: job.next_action, credential_id: credential.id });
    } catch (err) {
      setSubmitError(err?.message || "任务创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const cabinName = useCallback((devId) => {
    const c = cabins.find((x) => x.dev_id === devId || Number(x.dev_id) === Number(devId));
    return c?.name || `舱位 ${devId}`;
  }, [cabins]);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5" data-component="StudyCabinPage" data-od-id="study-cabin">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">凭据与任务</div>
        <h1>学习舱预约任务</h1>
        <p className="text-[var(--muted)] text-sm prose-body">选好舱位，到点自动帮你抢。</p>
      </div>

      <Alert variant="info" title="小提示">
        <span>建议提前几分钟创建任务，留出系统准备时间。</span>
      </Alert>

      {/* 凭据状态 */}
      <Card data-component="CredentialStatus" data-od-id="credential-status">
        <CardHeader>
          <CardTitle>学习舱凭据</CardTitle>
          <CardDescription>
            用于代你登录学校系统抢舱位的账号密码。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {credLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]"><Spinner /> 加载已托管凭据…</div>
          ) : credential ? (
            <Alert variant="success" title="已找到可用凭据">
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge variant="success">可用</Badge>
                {credential.metadata?.account_hint && <span className="opacity-80">（{credential.metadata.account_hint}）</span>}
                {credential.expires_at && <span className="opacity-70">· 过期 {new Date(credential.expires_at).toLocaleString("zh-CN", { hour12: false })}</span>}
              </span>
            </Alert>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={createStudyCred}>
              <Alert variant="warning" title="尚未托管学习舱凭据">
                <span>请先填写学校账号密码并托管。学校密码仅用于本次创建，提交后立即从内存清空。</span>
              </Alert>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>学号</Label>
                  <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" required />
                </div>
                <div>
                  <Label>学校密码</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="提交后立即清空" required />
                </div>
                <div>
                  <Label>脱敏提示（可选）</Label>
                  <Input value={accountHint} onChange={(e) => setAccountHint(e.target.value)} placeholder="尾号 0001" />
                </div>
                <div>
                  <Label>凭据有效期（秒）</Label>
                  <Input type="number" min="300" max="2592000" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
                  <div className="text-[11px] text-[var(--muted)] mt-1">默认 7 天（604800 秒）</div>
                </div>
              </div>
              {credError && <Alert variant="warning" title="凭据创建失败">{credError}</Alert>}
              <Button type="submit" className="self-start" loading={creatingCred}>
                <ShieldCheck className="w-4 h-4" /> 托凭据
              </Button>
            </form>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadCredential} disabled={credLoading}>
              <RefreshCw className="w-3.5 h-3.5" /> 刷新凭据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 预约信息 */}
      <Card>
        <CardHeader><CardTitle>预约信息</CardTitle><CardDescription>时间 10 分钟粒度，时长 30–240 分钟，范围 08:00–22:50。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t">标题（1–30 字符）</Label>
            <Input id="t" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 30))} placeholder="如：周四晚自习" />
            <div className="text-[11px] text-[var(--muted)] text-right tabular-nums">{title.length}/30</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d">预约日期</Label>
              <Input id="d" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st">开始时间</Label>
              <Input id="st" type="time" step="600" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="et">结束时间</Label>
              <Input id="et" type="time" step="600" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 舱位优先级（来自 GET /study-cabin/cabins） */}
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>舱位优先级</CardTitle>
            <CardDescription>从学校系统获取舱位列表，点击按你的优先级加入，不能重复。系统会按顺序帮你抢，抢到即止。</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadCabins} disabled={cabinsLoading}>
            <RefreshCw className="w-3.5 h-3.5" /> 刷新舱位
          </Button>
        </CardHeader>
        <CardContent>
          {cabinsLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--muted)] py-6"><Spinner /> 加载舱位列表…</div>
          ) : cabinsError ? (
            <Alert variant="warning" title="舱位加载失败">{cabinsError}</Alert>
          ) : cabins.length === 0 ? (
            <Alert variant="info" title="暂无可用舱位">暂时没有可抢的舱位，请稍后刷新。</Alert>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {cabins.map((c) => {
                const devId = Number(c.dev_id);
                const idx = selected.indexOf(devId);
                const isSel = idx >= 0;
                return (
                  <button
                    key={devId}
                    type="button"
                    onClick={() => toggleCabin(devId)}
                    className={cn("flex items-center gap-2 p-3 rounded-[var(--radius-sm)] border text-left text-[13px] transition-colors", isSel ? "border-[var(--seed-primary)] bg-[var(--primary-muted)]" : "border-border hover:bg-[var(--seed-surface-2)]")}
                    data-component="CabinOption"
                    data-od-id={`cabin-${devId}`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    <Armchair className="w-4 h-4 text-[var(--seed-primary-strong)]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                    </div>
                    {isSel && <Badge>第 {idx + 1}</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          {selected.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {selected.map((devId, i) => (
                  <Badge key={devId} className="gap-1.5">
                    <span>第 {i + 1}</span>
                    <span className="text-[var(--muted)]">·</span>
                    <span>{cabinName(devId)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -mr-1" onClick={() => moveCabin(i, -1)} disabled={i === 0} aria-label="上移">↑</Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -mr-1" onClick={() => moveCabin(i, 1)} disabled={i === selected.length - 1} aria-label="下移">↓</Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 调度与截止 */}
      <Card>
        <CardHeader><CardTitle>调度与截止</CardTitle><CardDescription>设置停止尝试时间和首次尝试时间。</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="au">停止尝试时间</Label>
            <Input id="au" type="datetime-local" value={attemptUntil} onChange={(e) => setAttemptUntil(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sf">首次尝试时间</Label>
            <Input id="sf" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* 提交 */}
      <div className="flex flex-col gap-3">
        <Alert variant="info" title="关于超时">
          <span>若学校系统响应超时，任务会进入待核验状态，需手动处理。成功结果只显示舱位、日期和时间。</span>
        </Alert>
        {submitError && <Alert variant="warning" title="任务创建失败">{submitError}</Alert>}
        {submitResult ? (
          <Alert variant="success" title="任务已创建">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={submitResult.state} />
              </div>
              {submitResult.next_action && (
                <div className="text-[12px] text-[var(--warning)] flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 需要你处理：{submitResult.next_action}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${submitResult.job_id}`)} className="self-start mt-1">
                查看任务详情 <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={submit} disabled={!valid || submitting} loading={submitting}>
              创建任务 <ArrowRight className="w-4 h-4" />
            </Button>
            {!credential && <span className="text-[13px] text-[var(--muted)] self-center">需先托管学习舱凭据</span>}
            {credential && !valid && <span className="text-[13px] text-[var(--muted)] self-center">请补全标题、日期、时间段并选择至少一个舱位</span>}
          </div>
        )}
      </div>
    </div>
  );
}
