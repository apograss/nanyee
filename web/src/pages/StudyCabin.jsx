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

export default function StudyCabin(qoderProps) {
  const navigate = useNavigate();
  const purpose = CREDENTIAL_PURPOSES.find((p) => p.purpose === "study_cabin");

  // datetime-local → ISO 8601 with本地时区（后端要求 +08:00 格式）
  const toISOWithTimezone = (datetimeLocal) => {
    if (!datetimeLocal) return null;
    const date = new Date(datetimeLocal);
    if (isNaN(date.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absOffset = Math.abs(offset);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  };

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
      if (attemptUntil) payload.attempt_until = toISOWithTimezone(attemptUntil);

      const body = {
        tool_id: "study_cabin",
        operation: "reserve",
        credential_id: credential.id,
        confirmation_version: CONFIRMATION_VERSIONS.studyCabinJob,
        payload,
      };
      if (scheduledFor) body.scheduled_for = toISOWithTimezone(scheduledFor);

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
    <div className={["max-w-3xl mx-auto flex flex-col gap-5", qoderProps?.className].filter(Boolean).join(" ")} data-component="StudyCabinPage" data-od-id="study-cabin" style={qoderProps?.style} data-qoder-id={qoderProps?.["data-qoder-id"]} data-qoder-source={qoderProps?.["data-qoder-source"]}>
      <div className="flex flex-col gap-1" data-qoder-id="qel-flex-169d6cc7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-169d6cc7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:156,&quot;column&quot;:7}}">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]" data-qoder-id="qel-text-11px-f8c8a73f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-f8c8a73f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:157,&quot;column&quot;:9}}">凭据与任务</div>
        <h1 data-qoder-id="qel-h1-94145017" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-h1-94145017&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;h1&quot;,&quot;loc&quot;:{&quot;line&quot;:158,&quot;column&quot;:9}}">学习舱预约任务</h1>
        <p className="text-[var(--muted)] text-sm prose-body" data-qoder-id="qel-text-var-muted-e2692a4d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-var-muted-e2692a4d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-var-muted&quot;,&quot;loc&quot;:{&quot;line&quot;:159,&quot;column&quot;:9}}">选好舱位，到点自动帮你抢。</p>
      </div>

      <Alert variant="info" title="小提示" data-qoder-id="qel-alert-96579e77" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-96579e77&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:162,&quot;column&quot;:7}}">
        <span data-qoder-id="qel-span-40b35e64" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-40b35e64&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:163,&quot;column&quot;:9}}">建议提前几分钟创建任务，留出系统准备时间。</span>
      </Alert>

      {/* 凭据状态 */}
      <Card data-component="CredentialStatus" data-od-id="credential-status" data-qoder-id="qel-credentialstatus-a8de31e8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-credentialstatus-a8de31e8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;credentialstatus&quot;,&quot;loc&quot;:{&quot;line&quot;:167,&quot;column&quot;:7}}">
        <CardHeader data-qoder-id="qel-cardheader-26561a9c" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardheader-26561a9c&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardheader&quot;,&quot;loc&quot;:{&quot;line&quot;:168,&quot;column&quot;:9}}">
          <CardTitle data-qoder-id="qel-cardtitle-c22371ba" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-c22371ba&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:169,&quot;column&quot;:11}}">学习舱凭据</CardTitle>
          <CardDescription data-qoder-id="qel-carddescription-762ed445" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-762ed445&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:170,&quot;column&quot;:11}}">
            用于代你登录学校系统抢舱位的账号密码。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4" data-qoder-id="qel-flex-64da1e6c" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-64da1e6c&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:174,&quot;column&quot;:9}}">
          {credLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]" data-qoder-id="qel-flex-95d4cf4b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-95d4cf4b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:176,&quot;column&quot;:13}}"><Spinner  data-qoder-id="qel-spinner-3e9160ba" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-spinner-3e9160ba&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;spinner&quot;,&quot;loc&quot;:{&quot;line&quot;:176,&quot;column&quot;:86}}"/> 加载已托管凭据…</div>
          ) : credential ? (
            <Alert variant="success" title="已找到可用凭据" data-qoder-id="qel-alert-7de6b5d1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-7de6b5d1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:178,&quot;column&quot;:13}}">
              <span className="inline-flex flex-wrap items-center gap-2" data-qoder-id="qel-inline-flex-c36f098b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-inline-flex-c36f098b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;inline-flex&quot;,&quot;loc&quot;:{&quot;line&quot;:179,&quot;column&quot;:15}}">
                <Badge variant="success" data-qoder-id="qel-badge-b5e2e60f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-badge-b5e2e60f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;badge&quot;,&quot;loc&quot;:{&quot;line&quot;:180,&quot;column&quot;:17}}">可用</Badge>
                {credential.metadata?.account_hint && <span className="opacity-80" data-qoder-id="qel-opacity-80-92389f12" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-opacity-80-92389f12&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;opacity-80&quot;,&quot;loc&quot;:{&quot;line&quot;:181,&quot;column&quot;:55}}">（{credential.metadata.account_hint}）</span>}
                {credential.expires_at && <span className="opacity-70" data-qoder-id="qel-opacity-70-5a778098" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-opacity-70-5a778098&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;opacity-70&quot;,&quot;loc&quot;:{&quot;line&quot;:182,&quot;column&quot;:43}}">· 过期 {new Date(credential.expires_at).toLocaleString("zh-CN", { hour12: false })}</span>}
              </span>
            </Alert>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={createStudyCred} data-qoder-id="qel-flex-a7175ff6" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-a7175ff6&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:186,&quot;column&quot;:13}}">
              <Alert variant="warning" title="尚未托管学习舱凭据" data-qoder-id="qel-alert-79e470ee" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-79e470ee&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:187,&quot;column&quot;:15}}">
                <span data-qoder-id="qel-span-ba560bdb" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-ba560bdb&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:188,&quot;column&quot;:17}}">请先填写学校账号密码并托管。学校密码仅用于本次创建，提交后立即从内存清空。</span>
              </Alert>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-qoder-id="qel-grid-23df9d05" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-23df9d05&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:190,&quot;column&quot;:15}}">
                <div data-qoder-id="qel-div-bad57629" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-bad57629&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:191,&quot;column&quot;:17}}">
                  <Label data-qoder-id="qel-label-acd091c2" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-acd091c2&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:192,&quot;column&quot;:19}}">学号</Label>
                  <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" required  data-qoder-id="qel-input-9b46f9a7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-9b46f9a7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:193,&quot;column&quot;:19}}"/>
                </div>
                <div data-qoder-id="qel-div-b7d57170" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-b7d57170&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:195,&quot;column&quot;:17}}">
                  <Label data-qoder-id="qel-label-b1d099a1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-b1d099a1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:196,&quot;column&quot;:19}}">学校密码</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="提交后立即清空" required  data-qoder-id="qel-input-9046e856" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-9046e856&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:197,&quot;column&quot;:19}}"/>
                </div>
                <div data-qoder-id="qel-div-b8d3346c" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-b8d3346c&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:199,&quot;column&quot;:17}}">
                  <Label data-qoder-id="qel-label-24cd7d13" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-24cd7d13&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:200,&quot;column&quot;:19}}">脱敏提示（可选）</Label>
                  <Input value={accountHint} onChange={(e) => setAccountHint(e.target.value)} placeholder="尾号 0001"  data-qoder-id="qel-input-9544b19e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-9544b19e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:201,&quot;column&quot;:19}}"/>
                </div>
                <div data-qoder-id="qel-div-bbd33925" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-bbd33925&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:203,&quot;column&quot;:17}}">
                  <Label data-qoder-id="qel-label-27cd81cc" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-27cd81cc&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:204,&quot;column&quot;:19}}">凭据有效期（秒）</Label>
                  <Input type="number" min="300" max="2592000" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}  data-qoder-id="qel-input-9844b657" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-9844b657&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:205,&quot;column&quot;:19}}"/>
                  <div className="text-[11px] text-[var(--muted)] mt-1" data-qoder-id="qel-text-11px-acdef32b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-acdef32b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:206,&quot;column&quot;:19}}">默认 7 天（604800 秒）</div>
                </div>
              </div>
              {credError && <Alert variant="warning" title="凭据创建失败" data-qoder-id="qel-alert-7be2357d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-7be2357d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:209,&quot;column&quot;:29}}">{credError}</Alert>}
              <Button type="submit" className="self-start" loading={creatingCred} data-qoder-id="qel-self-start-a4420405" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-self-start-a4420405&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;self-start&quot;,&quot;loc&quot;:{&quot;line&quot;:210,&quot;column&quot;:15}}">
                <ShieldCheck className="w-4 h-4"  data-qoder-id="qel-w-4-eb3f3a5a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-4-eb3f3a5a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-4&quot;,&quot;loc&quot;:{&quot;line&quot;:211,&quot;column&quot;:17}}"/> 托凭据
              </Button>
            </form>
          )}
          <div className="flex items-center gap-2" data-qoder-id="qel-flex-04cd2f43" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-04cd2f43&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:215,&quot;column&quot;:11}}">
            <Button variant="ghost" size="sm" onClick={loadCredential} disabled={credLoading} data-qoder-id="qel-button-a0d76ea8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-button-a0d76ea8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;button&quot;,&quot;loc&quot;:{&quot;line&quot;:216,&quot;column&quot;:13}}">
              <RefreshCw className="w-3.5 h-3.5"  data-qoder-id="qel-w-3-5-5704adc7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-3-5-5704adc7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-3-5&quot;,&quot;loc&quot;:{&quot;line&quot;:217,&quot;column&quot;:15}}"/> 刷新凭据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 预约信息 */}
      <Card data-qoder-id="qel-card-248b4782" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-card-248b4782&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;card&quot;,&quot;loc&quot;:{&quot;line&quot;:224,&quot;column&quot;:7}}">
        <CardHeader data-qoder-id="qel-cardheader-8798025d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardheader-8798025d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardheader&quot;,&quot;loc&quot;:{&quot;line&quot;:225,&quot;column&quot;:9}}"><CardTitle data-qoder-id="qel-cardtitle-bb3032a8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-bb3032a8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:225,&quot;column&quot;:21}}">预约信息</CardTitle><CardDescription data-qoder-id="qel-carddescription-713b9859" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-713b9859&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:225,&quot;column&quot;:48}}">时间 10 分钟粒度，时长 30–240 分钟，范围 08:00–22:50。</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4" data-qoder-id="qel-flex-e1e61c26" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-e1e61c26&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:226,&quot;column&quot;:9}}">
          <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-0ccd3bdb" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-0ccd3bdb&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:227,&quot;column&quot;:11}}">
            <Label htmlFor="t" data-qoder-id="qel-label-34dedf64" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-34dedf64&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:228,&quot;column&quot;:13}}">标题（1–30 字符）</Label>
            <Input id="t" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 30))} placeholder="如：周四晚自习"  data-qoder-id="qel-t-a893c35a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-t-a893c35a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;t&quot;,&quot;loc&quot;:{&quot;line&quot;:229,&quot;column&quot;:13}}"/>
            <div className="text-[11px] text-[var(--muted)] text-right tabular-nums" data-qoder-id="qel-text-11px-a5da6af8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-a5da6af8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:230,&quot;column&quot;:13}}">{title.length}/30</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-qoder-id="qel-grid-1cdd5369" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-1cdd5369&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:232,&quot;column&quot;:11}}">
            <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-1dcb1807" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-1dcb1807&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:233,&quot;column&quot;:13}}">
              <Label htmlFor="d" data-qoder-id="qel-label-2bdc92a2" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-2bdc92a2&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:234,&quot;column&quot;:15}}">预约日期</Label>
              <Input id="d" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}  data-qoder-id="qel-d-59038a31" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-d-59038a31&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;d&quot;,&quot;loc&quot;:{&quot;line&quot;:235,&quot;column&quot;:15}}"/>
            </div>
            <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-18cb1028" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-18cb1028&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:237,&quot;column&quot;:13}}">
              <Label htmlFor="st" data-qoder-id="qel-label-2adc910f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-2adc910f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:238,&quot;column&quot;:15}}">开始时间</Label>
              <Input id="st" type="time" step="600" value={startTime} onChange={(e) => setStartTime(e.target.value)}  data-qoder-id="qel-st-2cd30c19" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-st-2cd30c19&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;st&quot;,&quot;loc&quot;:{&quot;line&quot;:239,&quot;column&quot;:15}}"/>
            </div>
            <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-17cb0e95" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-17cb0e95&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:241,&quot;column&quot;:13}}">
              <Label htmlFor="et" data-qoder-id="qel-label-41da76ad" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-41da76ad&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:242,&quot;column&quot;:15}}">结束时间</Label>
              <Input id="et" type="time" step="600" value={endTime} onChange={(e) => setEndTime(e.target.value)}  data-qoder-id="qel-et-5f348cab" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-et-5f348cab&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;et&quot;,&quot;loc&quot;:{&quot;line&quot;:243,&quot;column&quot;:15}}"/>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 舱位优先级（来自 GET /study-cabin/cabins） */}
      <Card data-qoder-id="qel-card-b5861b97" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-card-b5861b97&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;card&quot;,&quot;loc&quot;:{&quot;line&quot;:250,&quot;column&quot;:7}}">
        <CardHeader className="flex-row items-start justify-between" data-qoder-id="qel-flex-row-1375e4a9" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-row-1375e4a9&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex-row&quot;,&quot;loc&quot;:{&quot;line&quot;:251,&quot;column&quot;:9}}">
          <div data-qoder-id="qel-div-4acbcb7d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-4acbcb7d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:252,&quot;column&quot;:11}}">
            <CardTitle data-qoder-id="qel-cardtitle-2f2ad916" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-2f2ad916&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:253,&quot;column&quot;:13}}">舱位优先级</CardTitle>
            <CardDescription data-qoder-id="qel-carddescription-01366adb" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-01366adb&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:254,&quot;column&quot;:13}}">从学校系统获取舱位列表，点击按你的优先级加入，不能重复。系统会按顺序帮你抢，抢到即止。</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadCabins} disabled={cabinsLoading} data-qoder-id="qel-button-16d2183c" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-button-16d2183c&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;button&quot;,&quot;loc&quot;:{&quot;line&quot;:256,&quot;column&quot;:11}}">
            <RefreshCw className="w-3.5 h-3.5"  data-qoder-id="qel-w-3-5-4d091b37" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-3-5-4d091b37&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-3-5&quot;,&quot;loc&quot;:{&quot;line&quot;:257,&quot;column&quot;:13}}"/> 刷新舱位
          </Button>
        </CardHeader>
        <CardContent data-qoder-id="qel-cardcontent-6a1445ca" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardcontent-6a1445ca&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardcontent&quot;,&quot;loc&quot;:{&quot;line&quot;:260,&quot;column&quot;:9}}">
          {cabinsLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--muted)] py-6" data-qoder-id="qel-flex-92c5c008" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-92c5c008&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:262,&quot;column&quot;:13}}"><Spinner  data-qoder-id="qel-spinner-37824b2b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-spinner-37824b2b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;spinner&quot;,&quot;loc&quot;:{&quot;line&quot;:262,&quot;column&quot;:91}}"/> 加载舱位列表…</div>
          ) : cabinsError ? (
            <Alert variant="warning" title="舱位加载失败" data-qoder-id="qel-alert-eeebe4e2" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-eeebe4e2&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:264,&quot;column&quot;:13}}">{cabinsError}</Alert>
          ) : cabins.length === 0 ? (
            <Alert variant="info" title="暂无可用舱位" data-qoder-id="qel-alert-efebe675" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-efebe675&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:266,&quot;column&quot;:13}}">暂时没有可抢的舱位，请稍后刷新。</Alert>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-qoder-id="qel-grid-b2d82f5d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-b2d82f5d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:268,&quot;column&quot;:13}}">
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
                   data-qoder-id="qel-cabinoption-7101db65" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cabinoption-7101db65&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cabinoption&quot;,&quot;loc&quot;:{&quot;line&quot;:274,&quot;column&quot;:19}}">
                    <GripVertical className="w-3.5 h-3.5 text-[var(--muted)] shrink-0"  data-qoder-id="qel-w-3-5-6c5993d7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-3-5-6c5993d7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-3-5&quot;,&quot;loc&quot;:{&quot;line&quot;:282,&quot;column&quot;:21}}"/>
                    <Armchair className="w-4 h-4 text-[var(--seed-primary-strong)]"  data-qoder-id="qel-w-4-9cd45a8e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-4-9cd45a8e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-4&quot;,&quot;loc&quot;:{&quot;line&quot;:283,&quot;column&quot;:21}}"/>
                    <div className="flex-1 min-w-0" data-qoder-id="qel-flex-1-98a3552e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-1-98a3552e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex-1&quot;,&quot;loc&quot;:{&quot;line&quot;:284,&quot;column&quot;:21}}">
                      <div className="font-medium truncate" data-qoder-id="qel-font-medium-b1f9d60f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-font-medium-b1f9d60f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;font-medium&quot;,&quot;loc&quot;:{&quot;line&quot;:285,&quot;column&quot;:23}}">{c.name}</div>
                    </div>
                    {isSel && <Badge data-qoder-id="qel-badge-48f993c7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-badge-48f993c7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;badge&quot;,&quot;loc&quot;:{&quot;line&quot;:287,&quot;column&quot;:31}}">第 {idx + 1}</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          {selected.length > 0 && (
            <div className="mt-3 flex flex-col gap-2" data-qoder-id="qel-mt-3-653d55ce" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-mt-3-653d55ce&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;mt-3&quot;,&quot;loc&quot;:{&quot;line&quot;:294,&quot;column&quot;:13}}">
              <div className="flex flex-wrap gap-1.5" data-qoder-id="qel-flex-8ec37b25" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-8ec37b25&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:295,&quot;column&quot;:15}}">
                {selected.map((devId, i) => (
                  <Badge key={devId} className="gap-1.5" data-qoder-id="qel-gap-1-5-6dcee833" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-gap-1-5-6dcee833&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;gap-1-5&quot;,&quot;loc&quot;:{&quot;line&quot;:297,&quot;column&quot;:19}}">
                    <span data-qoder-id="qel-span-bc470477" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-bc470477&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:298,&quot;column&quot;:21}}">第 {i + 1}</span>
                    <span className="text-[var(--muted)]" data-qoder-id="qel-text-var-muted-d37ff1e7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-var-muted-d37ff1e7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-var-muted&quot;,&quot;loc&quot;:{&quot;line&quot;:299,&quot;column&quot;:21}}">·</span>
                    <span data-qoder-id="qel-span-be47079d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-be47079d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:300,&quot;column&quot;:21}}">{cabinName(devId)}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -mr-1" onClick={() => moveCabin(i, -1)} disabled={i === 0} aria-label="上移" data-qoder-id="qel-button-26f4c3ae" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-button-26f4c3ae&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;button&quot;,&quot;loc&quot;:{&quot;line&quot;:301,&quot;column&quot;:21}}">↑</Button>
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 -mr-1" onClick={() => moveCabin(i, 1)} disabled={i === selected.length - 1} aria-label="下移" data-qoder-id="qel-button-21f4bbcf" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-button-21f4bbcf&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;button&quot;,&quot;loc&quot;:{&quot;line&quot;:302,&quot;column&quot;:21}}">↓</Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 调度与截止 */}
      <Card data-qoder-id="qel-card-a2950838" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-card-a2950838&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;card&quot;,&quot;loc&quot;:{&quot;line&quot;:312,&quot;column&quot;:7}}">
        <CardHeader data-qoder-id="qel-cardheader-058bfcc4" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardheader-058bfcc4&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardheader&quot;,&quot;loc&quot;:{&quot;line&quot;:313,&quot;column&quot;:9}}"><CardTitle data-qoder-id="qel-cardtitle-b30fd265" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-b30fd265&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:313,&quot;column&quot;:21}}">调度与截止</CardTitle><CardDescription data-qoder-id="qel-carddescription-034339f4" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-034339f4&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:313,&quot;column&quot;:49}}">设置停止尝试时间和首次尝试时间。</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-qoder-id="qel-grid-0db4244e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-0db4244e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:314,&quot;column&quot;:9}}">
          <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-8ac13642" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-8ac13642&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:315,&quot;column&quot;:11}}">
            <Label htmlFor="au" data-qoder-id="qel-label-bce67141" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-bce67141&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:316,&quot;column&quot;:13}}">停止尝试时间</Label>
            <Input id="au" type="datetime-local" value={attemptUntil} onChange={(e) => setAttemptUntil(e.target.value)}  data-qoder-id="qel-au-32e8fff0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-au-32e8fff0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;au&quot;,&quot;loc&quot;:{&quot;line&quot;:317,&quot;column&quot;:13}}"/>
          </div>
          <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-89c134af" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-89c134af&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:319,&quot;column&quot;:11}}">
            <Label htmlFor="sf" data-qoder-id="qel-label-b7e66962" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-b7e66962&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:320,&quot;column&quot;:13}}">首次尝试时间</Label>
            <Input id="sf" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}  data-qoder-id="qel-sf-cff675cc" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-sf-cff675cc&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;sf&quot;,&quot;loc&quot;:{&quot;line&quot;:321,&quot;column&quot;:13}}"/>
          </div>
        </CardContent>
      </Card>

      {/* 提交 */}
      <div className="flex flex-col gap-3" data-qoder-id="qel-flex-5f04e6aa" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-5f04e6aa&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:327,&quot;column&quot;:7}}">
        <Alert variant="info" title="关于超时" data-qoder-id="qel-alert-a637f461" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-a637f461&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:328,&quot;column&quot;:9}}">
          <span data-qoder-id="qel-span-29114d28" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-29114d28&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:329,&quot;column&quot;:11}}">若学校系统响应超时，任务会进入待核验状态，需手动处理。成功结果只显示舱位、日期和时间。</span>
        </Alert>
        {submitError && <Alert variant="warning" title="任务创建失败" data-qoder-id="qel-alert-a437f13b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-a437f13b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:331,&quot;column&quot;:25}}">{submitError}</Alert>}
        {submitResult ? (
          <Alert variant="success" title="任务已创建" data-qoder-id="qel-alert-a937f91a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-a937f91a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:333,&quot;column&quot;:11}}">
            <div className="flex flex-col gap-2" data-qoder-id="qel-flex-5c04e1f1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-5c04e1f1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:334,&quot;column&quot;:13}}">
              <div className="flex flex-wrap items-center gap-2" data-qoder-id="qel-flex-5904dd38" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-5904dd38&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:335,&quot;column&quot;:15}}">
                <StatusBadge status={submitResult.state}  data-qoder-id="qel-statusbadge-b47d888f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-statusbadge-b47d888f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;statusbadge&quot;,&quot;loc&quot;:{&quot;line&quot;:336,&quot;column&quot;:17}}"/>
              </div>
              {submitResult.next_action && (
                <div className="text-[12px] text-[var(--warning)] flex items-center gap-1.5 mt-1" data-qoder-id="qel-text-12px-ba71c4ec" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-12px-ba71c4ec&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-12px&quot;,&quot;loc&quot;:{&quot;line&quot;:339,&quot;column&quot;:17}}">
                  <AlertTriangle className="w-3.5 h-3.5"  data-qoder-id="qel-w-3-5-a2198af0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-3-5-a2198af0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-3-5&quot;,&quot;loc&quot;:{&quot;line&quot;:340,&quot;column&quot;:19}}"/> 需要你处理：{submitResult.next_action}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${submitResult.job_id}`)} className="self-start mt-1" data-qoder-id="qel-self-start-b11a14e4" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-self-start-b11a14e4&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;self-start&quot;,&quot;loc&quot;:{&quot;line&quot;:343,&quot;column&quot;:15}}">
                查看任务详情 <ArrowRight className="w-4 h-4"  data-qoder-id="qel-w-4-b42a0b8f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-4-b42a0b8f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-4&quot;,&quot;loc&quot;:{&quot;line&quot;:344,&quot;column&quot;:24}}"/>
              </Button>
            </div>
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-2 items-center" data-qoder-id="qel-flex-4706ff79" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-4706ff79&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:349,&quot;column&quot;:11}}">
            <Button onClick={submit} disabled={!valid || submitting} loading={submitting} data-qoder-id="qel-button-14dc8e4e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-button-14dc8e4e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;button&quot;,&quot;loc&quot;:{&quot;line&quot;:350,&quot;column&quot;:13}}">
              创建任务 <ArrowRight className="w-4 h-4"  data-qoder-id="qel-w-4-af2a03b0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-4-af2a03b0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;w-4&quot;,&quot;loc&quot;:{&quot;line&quot;:351,&quot;column&quot;:20}}"/>
            </Button>
            {!credential && <span className="text-[13px] text-[var(--muted)] self-center" data-qoder-id="qel-text-13px-14d79928" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-13px-14d79928&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-13px&quot;,&quot;loc&quot;:{&quot;line&quot;:353,&quot;column&quot;:29}}">需先托管学习舱凭据</span>}
            {credential && !valid && <span className="text-[13px] text-[var(--muted)] self-center" data-qoder-id="qel-text-13px-17d79de1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-13px-17d79de1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/StudyCabin.jsx&quot;,&quot;componentName&quot;:&quot;StudyCabin&quot;,&quot;elementRole&quot;:&quot;text-13px&quot;,&quot;loc&quot;:{&quot;line&quot;:354,&quot;column&quot;:38}}">请补全标题、日期、时间段并选择至少一个舱位</span>}
          </div>
        )}
      </div>
    </div>
  );
}
