// Canvas design runtime editable source marker: enrollment
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, RefreshCw, X, Plus, GripVertical, Activity, Zap, StopCircle, Cookie, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Select, Label, Badge, Alert, cn } from "@/components/ui.jsx";
import {
  fetchEnrollmentCategories, fetchEnrollmentCourses, startEnrollmentRun,
  getEnrollmentRun, cancelEnrollmentRun, createEnrollmentCookieSession, apiGet, apiPost,
  ENROLLMENT_TERMINAL_STATES, CONFIRMATION_VERSIONS,
} from "@/lib/api.jsx";
import { recognizeCaptcha } from "@/lib/captcha-ocr.jsx";

/* ---------- 入场动效（与首页同一组曲线，克制使用） ---------- */
const EASE = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/* ---------- 学校登录 ---------- */
function AcademicSessionCard({ onSession }) {
  const [captcha, setCaptcha] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [ocrResult, setOcrResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [autoOCR, setAutoOCR] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [loginMode, setLoginMode] = useState("password");
  const [cookie, setCookie] = useState("");
  const [error, setError] = useState("");

  const fetchCaptcha = useCallback(async () => {
    try {
      const data = await apiGet("/smu/captcha", { action: "smu_captcha" });
      const dataUrl = `data:${data.content_type};base64,${data.image_base64}`;
      setCaptcha({ flow_id: data.flow_id, dataUrl, expires_at: data.expires_at });
      setCaptchaCode(""); setOcrResult(null);
      if (autoOCR) {
        setOcrBusy(true);
        const r = await recognizeCaptcha(dataUrl);
        if (r) { setOcrResult(r); setCaptchaCode(r.text); }
        setOcrBusy(false);
      }
    } catch { setCaptcha(null); }
  }, [autoOCR]);

  useEffect(() => {
    if (!session && loginMode === "password") fetchCaptcha();
  }, [session, loginMode, fetchCaptcha]);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(session.expires_at) - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) { setSession(null); onSession(null); }
    };
    tick(); const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, onSession]);

  const login = async () => {
    setLoading(true);
    setError("");
    try {
      const data = loginMode === "cookie"
        ? await createEnrollmentCookieSession(cookie)
        : await apiPost("/smu/session", { flow_id: captcha.flow_id, account, password, captcha: captchaCode }, { action: "smu_login" });
      setSession(data); onSession(data); setPassword(""); setCaptchaCode("");
      setCookie("");
    } catch (err) {
      setError(err?.message || "登录失败，请检查输入后重试。");
      if (loginMode === "password") fetchCaptcha();
    }
    setLoading(false);
  };

  return (
    <Card data-component="AcademicSessionCard" data-od-id="enrollment-session">
      <CardHeader>
        <div className="kicker"><strong>Academic Session</strong></div>
        <CardTitle>学校系统登录</CardTitle>
        <CardDescription>登录后固定 24 小时有效；选课成功会自动删除本次学校会话。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {session ? (
          <div className="flex items-center justify-between rounded-[var(--radius)] border border-border p-4 bg-[var(--seed-surface-2)]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
              <span className="text-[13px]">已登录，剩余 <span className="tabular-nums font-medium">{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span></span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSession(null); onSession(null); }}>重新登录</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="选课登录方式">
              <Button type="button" variant={loginMode === "password" ? "default" : "outline"} onClick={() => setLoginMode("password")}>账号密码登录</Button>
              <Button type="button" variant={loginMode === "cookie" ? "default" : "outline"} onClick={() => setLoginMode("cookie")}><Cookie className="w-4 h-4" /> Cookie 登录</Button>
            </div>
            {loginMode === "password" ? <>
              <Alert variant="warning" title="账号密码登录提示">
                <span>通过统一认证登录会让当前同时登录教务系统的另一台设备下线。若不希望影响另一台设备，请使用 Cookie 登录。</span>
              </Alert>
              <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>验证码</Label>
                {captcha ? (
                  <img src={captcha.dataUrl} alt="验证码" className="h-10 rounded-[var(--radius)] border border-border" />
                ) : (
                  <div className="h-10 w-[110px] rounded-[var(--radius)] border border-border flex items-center justify-center text-[11px] text-[var(--muted)]">加载中…</div>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={fetchCaptcha} aria-label="刷新验证码"><RefreshCw className={cn("w-4 h-4", ocrBusy && "animate-spin")} /></Button>
              <div className="flex-1">
                <Label>识别结果</Label>
                <Input value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value)} placeholder="输入或自动识别" className="font-mono" />
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--muted)] cursor-pointer mb-0.5">
                <input type="checkbox" checked={autoOCR} onChange={(e) => setAutoOCR(e.target.checked)} className="accent-[var(--seed-primary)]" />
                开启自动识别
              </label>
              </div>
            {ocrResult && (
              <div className="text-[11px] text-[var(--muted)]">已自动识别: <span className="font-mono">{ocrResult.text}</span> · 置信度 {ocrResult.confidence.toFixed(0)}%</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>学号</Label><Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" /></div>
              <div><Label>学校密码</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            </div>
            <Button onClick={login} loading={loading} disabled={!captcha || !account || !password || !captchaCode}>使用账号密码登录</Button>
            </> : <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enrollment-cookie">教务系统 Cookie</Label>
                <textarea
                  id="enrollment-cookie"
                  value={cookie}
                  onChange={(event) => setCookie(event.target.value)}
                  rows={4}
                  className="w-full rounded-[var(--radius)] border border-border bg-[var(--seed-bg)] px-3 py-2 text-[13px] font-mono outline-none focus:border-[var(--seed-primary)]"
                  placeholder="可粘贴完整 Cookie、Cookie: ... 或单独的 JSESSIONID 值"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div id="enrollment-cookie-tutorial" data-tutorial-slot="enrollment-cookie" className="flex items-center justify-between rounded-[var(--radius)] border border-dashed border-border p-3.5">
                <span className="text-[13px] text-[var(--muted)]">不知道怎么获取 Cookie？查看图文教程。</span>
                <a href="/tutorials/enrollment-tutorial.html" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 h-8 text-[13px] font-medium text-[var(--seed-primary-strong)] hover:bg-[var(--seed-surface-2)] transition-colors shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" /> 图文教程
                </a>
              </div>
              <Button onClick={login} loading={loading} disabled={!cookie.trim()}>使用 Cookie 登录</Button>
            </>}
            {error && <Alert variant="danger" title="登录失败"><span>{error}</span></Alert>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- 选课运行状态 ---------- */
const RUN_STATE_LABELS = { calibrating: "校准中", waiting: "等待计划", running: "运行中", succeeded: "成功", failed: "失败", cancelled: "已取消" };
const RUN_STATE_COLORS = {
  calibrating: "bg-[var(--warning-muted)] text-[var(--warning)]",
  waiting: "bg-[color-mix(in_srgb,var(--seed-muted)_14%,var(--seed-bg))] text-[var(--muted)]",
  running: "bg-[var(--primary-muted)] text-[var(--seed-primary-strong)]",
  succeeded: "bg-[var(--success-muted)] text-[var(--success)]",
  failed: "bg-[var(--danger-muted)] text-[var(--danger)]",
  cancelled: "bg-[color-mix(in_srgb,var(--seed-muted)_14%,var(--seed-bg))] text-[var(--muted)]",
};

function RunStatusView({ run, onCancel }) {
  const isTerminal = ENROLLMENT_TERMINAL_STATES.includes(run.state);
  return (
    <Card data-component="RunStatusView" data-od-id="enrollment-run">
      <CardHeader className="flex-row items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="kicker"><strong>Run Status</strong></div>
          <CardTitle>选课任务</CardTitle>
          <CardDescription>查看本次选课的运行情况。</CardDescription>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-0.5 text-[12px] font-medium", RUN_STATE_COLORS[run.state])}>
          {run.state === "running" && <Activity className="w-3 h-3 animate-pulse" />}
          {RUN_STATE_LABELS[run.state]}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
            <div className={cn("h-full rounded-[var(--radius-full)] transition-all", run.state === "succeeded" ? "bg-[var(--success)]" : "bg-[var(--seed-primary)]")} style={{ width: `${Math.min(100, (run.attempt_count / run.max_attempts) * 100)}%` }} />
          </div>
          <span className="text-[13px] tabular-nums text-[var(--muted)]">{run.attempt_count}/{run.max_attempts}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="kicker">志愿顺序</div>
          {run.preferences.map((p, i) => (
            <div key={p.task_code} className="flex items-center gap-2 text-[13px]">
              <Badge variant={i === 0 ? "default" : "outline"}>第{i + 1}志愿</Badge>
              <span className="font-medium">{p.name}</span>
            </div>
          ))}
        </div>
        {run.result && (
          <div className={cn("rounded-[var(--radius)] border p-4 flex gap-3", run.result.success ? "border-[color-mix(in_srgb,var(--seed-success)_40%,transparent)] bg-[var(--success-muted)]" : "border-[color-mix(in_srgb,var(--seed-danger)_40%,transparent)] bg-[var(--danger-muted)]")}>
            {run.result.success ? <CheckCircle2 className="w-4 h-4 text-[var(--success)] mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-[var(--danger)] mt-0.5 shrink-0" />}
            <div className="text-[13px]">
              <div className="font-medium">{run.result.course_name}</div>
              <div className="text-[var(--muted)]">{run.result.outcome}{run.result.message ? ` · ${run.result.message}` : ""}</div>
            </div>
          </div>
        )}
        <div className="rounded-[var(--radius)] border border-border overflow-hidden" data-component="EventStream">
          <div className="px-4 py-2 bg-[var(--seed-surface-2)] kicker flex items-center gap-1.5">
            <Activity className="w-3 h-3" /> 运行动态
          </div>
          <div className="max-h-[240px] overflow-y-auto flex flex-col">
            {run.events.slice().reverse().map((ev, i) => (
              <div key={ev.sequence} className={cn("flex items-start gap-2.5 px-4 py-2 text-[12px] border-t border-border", i === 0 && "bg-[var(--seed-surface-2)]")}>
                <span className="font-mono text-[10px] text-[var(--muted)] tabular-nums shrink-0 mt-0.5">
                  {new Date(ev.created_at).toLocaleTimeString("zh-CN", { hour12: false })}
                </span>
                {ev.attempt != null && <Badge variant="muted" className="shrink-0">#{ev.attempt}</Badge>}
                <span className={cn("flex-1", i === 0 && "font-medium")}>{ev.message}</span>
                {ev.course_name && <span className="text-[var(--muted)] shrink-0">{ev.course_name}</span>}
              </div>
            ))}
          </div>
        </div>
        {!isTerminal && (
          <Button variant="danger" size="sm" onClick={onCancel}><StopCircle className="w-4 h-4" /> 停止选课</Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- 主页面 ---------- */
export default function Enrollment() {
  const [academicSession, setAcademicSession] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [courses, setCourses] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [scheduledTime, setScheduledTime] = useState("09:00:00");
  const [maxAttempts, setMaxAttempts] = useState(15);
  const [primaryBurst, setPrimaryBurst] = useState(5);
  const [confirmConflicts, setConfirmConflicts] = useState(true);
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const loadCategories = async () => {
    if (!academicSession) return;
    try {
      const data = await fetchEnrollmentCategories(academicSession.academic_session_id);
      setCategories(data);
    } catch (err) {
      setCategories([]);
      if (err?.status === 410) {
        // 学校会话已在服务端失效：回到学校登录卡
        setAcademicSession(null);
      }
    }
  };
  useEffect(() => { if (academicSession) loadCategories(); }, [academicSession]);

  const loadCourses = async (cat) => {
    setSelectedCategory(cat);
    setPreferences([]);
    try {
      const data = await fetchEnrollmentCourses(academicSession.academic_session_id, cat.code);
      setCourses(data);
    } catch (err) {
      setCourses([]);
      if (err?.status === 410) {
        // 学校会话已在服务端失效：回到学校登录卡
        setAcademicSession(null);
      }
    }
  };

  const addPreference = (course) => {
    if (preferences.length >= 4) return;
    if (preferences.find((p) => p.task_code === course.task_code)) return;
    setPreferences([...preferences, course]);
  };
  const removePreference = (taskCode) => setPreferences(preferences.filter((p) => p.task_code !== taskCode));
  const movePreference = (idx, dir) => {
    const next = [...preferences];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setPreferences(next);
  };

  const startRun = async () => {
    setLoading(true);
    try {
      const data = await startEnrollmentRun({
        academic_session_id: academicSession.academic_session_id,
        category_code: selectedCategory.code,
        preference_task_codes: preferences.map((p) => p.task_code),
        scheduled_time: scheduledTime || null,
        max_attempts: maxAttempts,
        primary_burst_attempts: primaryBurst,
        confirm_conflicts: confirmConflicts,
        confirmation_version: CONFIRMATION_VERSIONS.enrollmentRun,
      });
      setRun(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (!run || ENROLLMENT_TERMINAL_STATES.includes(run.state)) return;
    pollRef.current = setInterval(async () => {
      try {
        const data = await getEnrollmentRun(run.id);
        setRun(data);
      } catch (err) {
        if (err?.status === 410) {
          // 学校会话已在服务端失效：停止轮询并清空会话，回到学校登录卡
          clearInterval(pollRef.current);
          setAcademicSession(null);
        }
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [run]);

  const doCancel = async () => {
    try {
      const data = await cancelEnrollmentRun(run.id);
      setRun(data);
    } catch {}
  };

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-5xl mx-auto flex flex-col gap-5"
      data-component="EnrollmentPage"
      data-od-id="enrollment"
    >
      {/* ---------- 编辑风页头 ---------- */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>Enrollment</strong> — 自动选课</span>
          <span className="rule-line flex-1" />
        </div>
        <h1 className="display-lede">在线选课</h1>
        <p className="text-[15px] text-[var(--muted)] prose-body">登录学校系统后，按志愿顺序选择课程，到达指定时间后系统会自动帮你尝试选课。</p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Alert variant="info" title="浏览器关闭不取消">
          <span>关闭浏览器不会取消本次选课。但若服务重启，本次选课将无法继续。</span>
        </Alert>
      </motion.div>

      {!academicSession && (
        <motion.div variants={fadeUp}>
          <AcademicSessionCard onSession={setAcademicSession} />
        </motion.div>
      )}

      {academicSession && !run && (
        <>
          <motion.div variants={fadeUp}>
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="kicker"><strong>Category</strong></div>
                  <CardTitle>选课类型</CardTitle>
                  <CardDescription>选择本次要参与的选课类型。</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadCategories}><RefreshCw className="w-4 h-4" /> 刷新</Button>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <div className="text-[13px] text-[var(--muted)]">加载中…</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categories.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => loadCourses(c)}
                        className={cn(
                          "text-left p-4 rounded-[var(--radius)] border transition-colors",
                          selectedCategory?.code === c.code ? "border-[var(--seed-primary)] bg-[var(--primary-muted)]" : "border-border hover:bg-[var(--seed-surface-2)]"
                        )}
                        data-component="CategoryCard"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium tracking-[0.01em]">{c.title}</span>
                          {selectedCategory?.code === c.code && <Badge>已选</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {selectedCategory && (
            <motion.div variants={fadeUp}>
              <Card>
                <CardHeader>
                  <div className="kicker"><strong>Courses</strong></div>
                  <CardTitle>可选课程</CardTitle>
                  <CardDescription>按优先级选择 1–4 门，点击箭头调整志愿顺序。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {preferences.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="kicker">已选志愿（优先级从高到低）</div>
                      {preferences.map((p, i) => (
                        <div key={p.task_code} className="flex items-center gap-2 rounded-[var(--radius)] border border-border p-2.5 bg-[var(--seed-surface-2)]">
                          <GripVertical className="w-4 h-4 text-[var(--muted)]" />
                          <Badge variant={i === 0 ? "default" : "outline"}>第{i + 1}志愿</Badge>
                          <span className="text-[13px] font-medium flex-1">{p.name}</span>
                          <div className="flex items-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => movePreference(i, -1)} aria-label="上移志愿"><ArrowUp className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === preferences.length - 1} onClick={() => movePreference(i, 1)} aria-label="下移志愿"><ArrowDown className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePreference(p.task_code)}><X className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="w-full overflow-x-auto rounded-[var(--radius)] border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--seed-surface-2)]">
                        <tr>
                          <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">课程</th>
                          <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">教师</th>
                          <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">时间</th>
                          <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap">容量</th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {courses.map((c) => {
                          const selected = preferences.find((p) => p.task_code === c.task_code);
                          const full = c.selected_count >= c.capacity;
                          return (
                            <tr key={c.task_code} className="border-t border-border hover:bg-[var(--seed-surface-2)]">
                              <td className="px-4 py-3">
                                <div className="font-medium text-[13px]">{c.name}</div>
                                <div className="text-[11px] text-[var(--muted)] mt-0.5">{c.department} · {c.credits}学分 · {c.hours}学时</div>
                              </td>
                              <td className="px-4 py-3 text-[13px]">{c.teacher}</td>
                              <td className="px-4 py-3 text-[13px] text-[var(--muted)]">{c.schedule}</td>
                              <td className="px-4 py-3 text-[13px] tabular-nums">{c.selected_count}/{c.capacity}</td>
                              <td className="px-4 py-3 text-right">
                                {selected ? (
                                  <Badge>已选</Badge>
                                ) : (
                                  <Button size="sm" variant="outline" disabled={full || preferences.length >= 4} onClick={() => addPreference(c)}>
                                    <Plus className="w-3.5 h-3.5" /> 添加
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {preferences.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card data-component="RunConfig" data-od-id="enrollment-config">
                <CardHeader>
                  <div className="kicker"><strong>Run Config</strong></div>
                  <CardTitle>运行配置</CardTitle>
                  <CardDescription>到达计划时间后自动开始选课。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>计划时间</Label>
                      <Input type="time" step="1" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                      <div className="text-[11px] text-[var(--muted)] mt-1">留空则立即开始</div>
                    </div>
                    <div>
                      <Label>最大尝试次数</Label>
                      <Input type="number" min="1" max="120" value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
                      <div className="text-[11px] text-[var(--muted)] mt-1">默认 15，上限 120</div>
                    </div>
                    <div>
                      <Label>首轮连续尝试</Label>
                      <Input type="number" min="0" max="120" value={primaryBurst} onChange={(e) => setPrimaryBurst(Number(e.target.value))} />
                      <div className="text-[11px] text-[var(--muted)] mt-1">到达后先连续尝试第一志愿</div>
                    </div>
                    <div>
                      <Label>冲突自动二次确认</Label>
                      <Select value={confirmConflicts ? "yes" : "no"} onChange={(e) => setConfirmConflicts(e.target.value === "yes")}>
                        <option value="yes">开启</option>
                        <option value="no">关闭</option>
                      </Select>
                      <div className="text-[11px] text-[var(--muted)] mt-1">冲突课程自动执行二次确认</div>
                    </div>
                  </div>
                  <div className="rounded-[var(--radius)] border border-border p-4 bg-[var(--seed-surface-2)] text-[13px] flex flex-col gap-1.5">
                    <div className="flex justify-between"><span className="text-[var(--muted)]">志愿数</span><span className="font-medium">{preferences.length} 门</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">第一志愿</span><span className="font-medium">{preferences[0]?.name}</span></div>
                  </div>
                  <Button onClick={startRun} loading={loading} disabled={preferences.length === 0}>
                    <Zap className="w-4 h-4" /> 启动自动选课
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {run && (
        <motion.div variants={fadeUp}>
          <RunStatusView run={run} onCancel={doCancel} />
        </motion.div>
      )}

      {run?.state === "failed" && (
        <motion.div variants={fadeUp}>
          <Alert variant="danger" title="选课失败">
            <span>已达到最大尝试次数或遇到错误。请检查课程余量或稍后重试。</span>
          </Alert>
        </motion.div>
      )}
    </motion.div>
  );
}
