// Canvas design runtime editable source marker: timetable
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { CalendarDays, Download, Image as ImageIcon, Clock, RefreshCw, ScanLine, Copy, Check, Share2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Select, Alert, Checkbox, Spinner, Textarea, cn } from "@/components/ui.jsx";
import { apiGet, apiPost, apiDownload, shareWakeup, CONFIRMATION_VERSIONS } from "@/lib/api.jsx";
import { loadSchoolCreds, saveSchoolCreds, clearSchoolCreds } from "@/lib/school-creds.jsx";
import { recognizeCaptcha, terminateOCR } from "@/lib/captcha-ocr.jsx";

// 瞬时学校会话状态：idle | captcha(取验证码) | session(已登录 24h) | expired
// flow_id 与 academic_session_id 仅内存，不入 localStorage/URL
// 学校密码 / 验证码：仅本次请求使用，提交后立即清空

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SECTIONS = [
  { n: 1, time: "08:00-08:45" }, { n: 2, time: "08:55-09:40" }, { n: 3, time: "10:10-10:55" },
  { n: 4, time: "11:05-11:50" }, { n: 5, time: "14:30-15:15" }, { n: 6, time: "15:25-16:10" },
  { n: 7, time: "16:30-17:15" }, { n: 8, time: "19:00-19:45" }, { n: 9, time: "19:55-20:40" },
];

const COLORS = ["bg-[var(--primary-muted)] text-[var(--seed-primary-strong)]", "bg-[var(--success-muted)] text-[var(--success)]"];

// 入场动效（与首页一致的编辑风 fadeUp/stagger，克制使用）
const EASE = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

function CaptchaImage({ src }) {
  // 真实接口：src 为 data:image/png;base64,...；src 为空时不渲染
  if (!src) return null;
  return (
    <div className="w-[120px] h-[48px] rounded-[var(--radius-sm)] border border-border bg-[var(--seed-surface)] flex items-center justify-center overflow-hidden shrink-0">
      <img src={src} alt="学校验证码" className="w-full h-full object-cover" />
    </div>
  );
}

function AcademicSessionCard({ session, onExpire }) {
  const [left, setLeft] = useState(300);
  useEffect(() => {
    if (!session) return;
    setLeft(300);
    const t = setInterval(() => setLeft((v) => {
      if (v <= 1) { clearInterval(t); onExpire(); return 0; }
      return v - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [session, onExpire]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <Alert variant={left < 60 ? "warning" : "success"} title="已登录学校系统">
      <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 登录有效，{mm}:{ss} 后过期需重新登录。</span>
    </Alert>
  );
}

export default function Timetable() {
  const [session, setSession] = useState(null); // { academic_session_id, expires_at }
  const [flowId, setFlowId] = useState(null); // 敏感态：仅内存
  const [captchaDataUrl, setCaptchaDataUrl] = useState(""); // 敏感态：仅内存
  const [captchaExpiresAt, setCaptchaExpiresAt] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState(""); // 敏感态：仅内存，提交后清空
  const [captcha, setCaptcha] = useState(""); // 敏感态：仅内存
  const [autoOcr, setAutoOcr] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null); // { text, confidence } | { error } | null
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  // 本机记住学号密码（localStorage 明文，用户显式勾选才保存）
  const [rememberCreds, setRememberCreds] = useState(false);

  // 已保存则自动填入，实现一键登录
  useEffect(() => {
    const saved = loadSchoolCreds();
    if (saved) {
      setAccount(saved.account);
      setPassword(saved.password);
      setRememberCreds(true);
    }
  }, []);

  const toggleRememberCreds = (on) => {
    setRememberCreds(on);
    if (!on) clearSchoolCreds();
  };

  const [week, setWeek] = useState(8);
  const [campus, setCampus] = useState("shunde");
  // 学期代码（xnxqdm）：登录后从教务系统拉取下拉列表，空串 = 后端按当前学期
  const [semesters, setSemesters] = useState([]);
  const [semesterCode, setSemesterCode] = useState("");
  // 学期周数不固定 20：输入草稿在 blur/Enter 时才提交为 totalWeeks
  const [totalWeeks, setTotalWeeks] = useState(20);
  const [weeksDraft, setWeeksDraft] = useState("20");
  // 学期第一周周一：留空则由后端按学校校历自动确定
  const [semesterMonday, setSemesterMonday] = useState("");
  const [exporting, setExporting] = useState(null); // "ics" | "wakeup" | null
  const [exportError, setExportError] = useState(null);
  // 课表事件：仅内存，会话过期/手动刷新时清空
  const [events, setEvents] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState(null);

  // WakeUp 分享
  const [shareConsent, setShareConsent] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCode, setShareCode] = useState(null);
  const [shareError, setShareError] = useState(null);
  const [copied, setCopied] = useState(false);
  const shareInputRef = useRef(null);

  // 取验证码：GET /smu/captcha → { flow_id, image_base64, content_type, expires_at }
  const fetchCaptcha = useCallback(async () => {
    setOcrResult(null);
    setCaptcha("");
    try {
      const data = await apiGet("/smu/captcha", { action: "smu_captcha" });
      const flow = data.flow_id || null;
      const dataUrl = data.image_base64
        ? `data:${data.content_type || "image/png"};base64,${data.image_base64}`
        : "";
      setFlowId(flow); // 仅内存
      setCaptchaDataUrl(dataUrl); // 仅内存
      setCaptchaExpiresAt(data.expires_at || null);
      return { flow, dataUrl };
    } catch (err) {
      setLoginError(err.message || "验证码获取失败，请稍后重试");
      return null;
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
    return () => { terminateOCR(); }; // 卸载时释放 ONNX session
  }, [fetchCaptcha]);

  // OCR 识别：仅在有真实图像时调用
  const runOcr = useCallback(async (dataUrl) => {
    if (!dataUrl) return;
    setOcrLoading(true);
    try {
      const result = await recognizeCaptcha(dataUrl);
      if (result) {
        setOcrResult(result);
        setCaptcha(result.text);
      } else {
        setOcrResult({ error: true });
      }
    } catch {
      setOcrResult({ error: true });
    } finally {
      setOcrLoading(false);
    }
  }, []);

  // 自动 OCR：取到验证码图像且 autoOcr 打开时自动识别
  useEffect(() => {
    if (autoOcr && captchaDataUrl !== undefined) {
      runOcr(captchaDataUrl);
    }
  }, [captchaDataUrl, autoOcr, runOcr]);

  // 拉取课表：POST /smu/timetable { academic_session_id, total_weeks, semester_code? } → events 仅内存
  const loadTimetable = useCallback(async (academicSessionId, code, weeks) => {
    setGridLoading(true);
    setGridError(null);
    try {
      const data = await apiPost(
        "/smu/timetable",
        { academic_session_id: academicSessionId, total_weeks: weeks, ...(code ? { semester_code: code } : {}) },
        { action: "smu_timetable" }
      );
      setEvents(data.events || []);
    } catch (err) {
      setEvents(null);
      if (err.status === 410) {
        // 学校会话已在服务端失效：清空会话，回到学校登录卡
        setSession(null);
        setGridError(null);
        fetchCaptcha();
      } else {
        setGridError(err.message || "课表获取失败，请稍后重试");
      }
    } finally {
      setGridLoading(false);
    }
  }, [fetchCaptcha]);

  // 登录学校系统：POST /smu/session { flow_id, account, password, captcha }
  const login = async (e) => {
    e.preventDefault();
    if (!flowId) {
      setLoginError("验证码已失效，请刷新验证码后重试");
      return;
    }
    setLoginError(null);
    setLoginLoading(true);
    try {
      const data = await apiPost("/smu/session", { flow_id: flowId, account, password, captcha }, { action: "smu_login" });
      // 登录成功才保存；未勾选时确保本地无残留
      if (rememberCreds) saveSchoolCreds(account, password); else clearSchoolCreds();
      setSession({ academic_session_id: data.academic_session_id, expires_at: data.expires_at });
      setPassword(""); // 学校密码只用于本次登录请求，立即清空
      setCaptcha("");
      setOcrResult(null);
      setFlowId(null);
      setCaptchaDataUrl("");
      // 学期列表（供切换学年学期）；拉取失败不阻塞，后端按教务系统当前学期处理
      let code = "";
      try {
        const sem = await apiPost("/smu/timetable.semesters", { academic_session_id: data.academic_session_id }, { action: "smu_timetable" });
        setSemesters(Array.isArray(sem.semesters) ? sem.semesters : []);
        code = sem.default_code || "";
        setSemesterCode(code);
      } catch { /* 忽略，导出时仍可手动留空 */ }
      loadTimetable(data.academic_session_id, code, totalWeeks);
    } catch (err) {
      setLoginError(err.message || "登录失败，请重新取验证码后重试");
      // 登录失败需重新取验证码
      fetchCaptcha();
    } finally {
      setLoginLoading(false);
    }
  };

  const refreshCaptcha = () => {
    setOcrResult(null);
    setCaptcha("");
    fetchCaptcha();
  };

  // 切换学期：重新拉取该学期课表
  const changeSemester = (code) => {
    setSemesterCode(code);
    if (session) loadTimetable(session.academic_session_id, code, totalWeeks);
  };

  // 周数草稿提交（blur/Enter）：钳到 1-30，变更才重新拉取
  const commitWeeks = () => {
    const n = Math.max(1, Math.min(30, Number.parseInt(weeksDraft, 10) || 20));
    setWeeksDraft(String(n));
    if (n === totalWeeks) return;
    setTotalWeeks(n);
    if (week > n) setWeek(n);
    if (session) loadTimetable(session.academic_session_id, semesterCode, n);
  };

  // 导出/分享共用的请求体；学期周一留空（后端按校历确定）或必须是周一
  const buildExportPayload = () => {
    if (semesterMonday) {
      const day = new Date(`${semesterMonday}T00:00:00`).getDay();
      if (day !== 1) {
        setExportError("学期周一必须是周一；留空则按学校校历自动确定。");
        return null;
      }
    }
    return {
      academic_session_id: session.academic_session_id,
      total_weeks: totalWeeks,
      ...(semesterCode ? { semester_code: semesterCode } : {}),
      ...(semesterMonday ? { semester_monday: semesterMonday } : {}),
    };
  };

  // 导出 ICS：POST /smu/timetable.ics → 浏览器下载 .ics；semester_monday 留空由后端按校历确定
  const exportIcs = async () => {
    if (!session) return;
    const body = buildExportPayload();
    if (!body) return;
    setExporting("ics");
    setExportError(null);
    try {
      await apiDownload("/smu/timetable.ics", body, "nanyee-timetable.ics", { action: "smu_timetable" });
    } catch (err) {
      if (err.status === 410) {
        // 学校会话已在服务端失效：清空会话，回到学校登录卡
        setSession(null);
        setEvents(null);
        setGridError(null);
        fetchCaptcha();
      } else {
        setExportError(err.message || "ICS 导出失败，请稍后重试");
      }
    } finally {
      setExporting(null);
    }
  };

  // 导出 WakeUp 文件：POST /smu/timetable.wakeup → 浏览器下载 .wakeup_schedule
  const exportWakeup = async () => {
    if (!session) return;
    const body = buildExportPayload();
    if (!body) return;
    setExporting("wakeup");
    setExportError(null);
    try {
      await apiDownload("/smu/timetable.wakeup", { ...body, campus }, "nanyee.wakeup_schedule", { action: "smu_timetable" });
    } catch (err) {
      if (err.status === 410) {
        // 学校会话已在服务端失效：清空会话，回到学校登录卡
        setSession(null);
        setEvents(null);
        setGridError(null);
        fetchCaptcha();
      } else {
        setExportError(err.message || "WakeUp 文件导出失败，请稍后重试");
      }
    } finally {
      setExporting(null);
    }
  };

  // 分享到 WakeUp：POST /smu/timetable.wakeup.share → { share_code }
  // 额外提交 confirmation_version: "timetable:wakeup_share:v1"；该路径会把生成的课表上传到 WakeUp，需用户明确同意
  const shareToWakeup = async () => {
    if (!session || !shareConsent) return;
    const body = buildExportPayload();
    if (!body) {
      setShareError("学期周一必须是周一；留空则按学校校历自动确定。");
      return;
    }
    setShareError(null);
    setSharing(true);
    setShareCode(null);
    try {
      const data = await shareWakeup({
        ...body,
        campus,
        confirmation_version: CONFIRMATION_VERSIONS.wakeupShare,
      });
      setShareCode(data.share_code);
    } catch (err) {
      if (err.status === 410) {
        // 学校会话已在服务端失效：清空会话，回到学校登录卡
        setSession(null);
        setEvents(null);
        setGridError(null);
        fetchCaptcha();
      } else {
        setShareError(err.message || "分享失败，可改用本地文件导入");
      }
    } finally {
      setSharing(false);
    }
  };

  // WakeUp 的“从分享口令导入”识别的是整段口令消息（「」内才是分享码），只粘裸码无法导入
  const shareMessage = shareCode
    ? `这是来自「WakeUp课程表」的课表分享，30分钟内有效哦，如果失效请朋友再分享一遍叭。为了保护隐私我们选择不监听你的剪贴板，请复制这条消息后，打开App的主界面，右上角第二个按钮 -> 从分享口令导入，按操作提示即可完成导入~分享口令为「${shareCode}」`
    : "";

  const copyShareMessage = async () => {
    if (!shareMessage) return;
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      shareInputRef.current?.select();
      document.execCommand?.("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8 sm:gap-10" data-component="TimetablePage" data-od-id="timetable">
      {/* ---------- 编辑风页面头 ---------- */}
      <motion.header variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3 pt-2">
        <motion.div variants={fadeUp} className="flex items-center gap-4">
          <span className="kicker"><strong>Timetable</strong> — 学校查询</span>
          <span className="rule-line flex-1" />
          <span className="kicker hidden sm:block">共 {totalWeeks} 教学周</span>
        </motion.div>
        <motion.h1 variants={fadeUp} className="display-lede">课表查询</motion.h1>
        <motion.p variants={fadeUp} className="text-[var(--muted)] text-sm prose-body">用学校账号登录后即可查看课表，验证码可以自动识别，密码仅用于本次登录。</motion.p>
      </motion.header>

      {/* ---------- 学校登录 / 会话倒计时 ---------- */}
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
        {!session ? (
          <Card data-component="SchoolLogin" data-od-id="school-login">
            <CardHeader>
              <div className="kicker"><strong>School Login</strong></div>
              <CardTitle>学校登录</CardTitle>
              <CardDescription>登录失败需重新输入验证码；学校密码只用于登录请求，勾选“记住”才会保存在本机浏览器。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={login}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="acc">学号</Label>
                    <Input id="acc" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pw">学校密码</Label>
                    <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="提交后即清空输入框" required />
                  </div>
                </div>
                <label className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] cursor-pointer select-none self-start">
                  <Checkbox checked={rememberCreds} onChange={toggleRememberCreds} />
                  记住学号和密码（仅保存在本浏览器，公共电脑勿勾选）
                </label>
                <div className="flex flex-col gap-1.5">
                  <Label>验证码</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <CaptchaImage src={captchaDataUrl} />
                    <Input value={captcha} onChange={(e) => setCaptcha(e.target.value)} placeholder="输入图中字符" className="max-w-[180px]" required />
                    <Button type="button" variant="ghost" size="icon" onClick={refreshCaptcha} aria-label="刷新验证码" disabled={loginLoading}><RefreshCw className="w-4 h-4" /></Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => runOcr(captchaDataUrl)}
                      disabled={ocrLoading}
                      loading={ocrLoading}
                    >
                      {ocrLoading ? <Spinner /> : <ScanLine className="w-4 h-4" />}
                      自动识别
                    </Button>
                    <label className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] cursor-pointer select-none">
                      <Checkbox checked={autoOcr} onChange={setAutoOcr} />
                      自动识别验证码
                    </label>
                  </div>
                  {ocrResult && !ocrResult.error && (
                    <div className="text-[12px] text-[var(--muted)] flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-[var(--success)]" />
                      已识别：<span className="font-mono text-foreground">{ocrResult.text}</span>
                    </div>
                  )}
                  {ocrResult?.error && (
                    <div className="text-[12px] text-[var(--warning)]">识别失败，请手动输入或刷新验证码。</div>
                  )}
                </div>
                {loginError && (
                  <Alert variant="warning" title="登录失败">{loginError}</Alert>
                )}
                <Button type="submit" className="self-start" loading={loginLoading}>登录学校系统</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <AcademicSessionCard session={session} onExpire={() => { setSession(null); setEvents(null); setGridError(null); fetchCaptcha(); }} />
        )}
      </motion.div>

      {/* ---------- 周课表网格 ---------- */}
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div className="flex flex-col gap-1">
              <div className="kicker"><strong>Weekly Grid</strong></div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[var(--seed-primary-strong)]" />
                第 {week} 周课表
              </CardTitle>
              <CardDescription>共 {totalWeeks} 教学周；学期与周次可切换。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {semesters.length > 0 && (
                <Select value={semesterCode} onChange={(e) => changeSemester(e.target.value)} className="w-[150px]" aria-label="学期">
                  {semesters.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                </Select>
              )}
              <Select value={String(week)} onChange={(e) => setWeek(Number(e.target.value))} className="w-[110px]">
                {Array.from({ length: totalWeeks }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 周</option>)}
              </Select>
              <Button variant="outline" size="icon" onClick={() => { setSession(null); setEvents(null); setGridError(null); fetchCaptcha(); }} aria-label="刷新会话" disabled={!session}><RefreshCw className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            {!session ? (
              <div className="py-10 text-center text-[13px] text-[var(--muted)]">登录学校系统后显示你的课表。</div>
            ) : gridLoading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-[13px] text-[var(--muted)]"><Spinner /> 课表加载中…</div>
            ) : gridError ? (
              <Alert variant="warning" title="课表加载失败">
                <div className="flex flex-wrap items-center gap-3">
                  <span>{gridError}</span>
                  <Button variant="outline" size="sm" onClick={() => loadTimetable(session.academic_session_id, semesterCode, totalWeeks)}>重试</Button>
                </div>
              </Alert>
            ) : (
              <div className="timetable-grid" data-component="TimetableGrid" data-od-id="timetable-grid">
                <div className="timetable-cell timetable-head">节次</div>
                {DAYS.map((d) => <div key={d} className="timetable-cell timetable-head">{d}</div>)}
                {SECTIONS.map((s) => (
                  <React.Fragment key={s.n}>
                    <div className="timetable-cell timetable-head" data-component="SectionCell">
                      <div className="font-medium">{s.n}</div>
                      <div className="text-[11px] text-[var(--muted)]">{s.time}</div>
                    </div>
                    {DAYS.map((_, di) => {
                      const course = (events || []).find((c) => c.week === week && c.weekday - 1 === di && c.start_node === s.n);
                      const span = course ? course.end_node - course.start_node + 1 : 1;
                      return (
                        <div key={di} className="timetable-cell" style={span > 1 ? { gridRow: `span ${span}` } : undefined}>
                          {course && (
                            <div className={cn("rounded-[var(--radius-sm)] p-2 h-full", COLORS[di % 2])} data-component="CourseCell">
                              <div className="text-[12px] font-medium leading-tight">{course.name}</div>
                              <div className="text-[10px] mt-0.5 opacity-80">{course.location}</div>
                              <div className="text-[10px] opacity-70">{course.teachers}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- 导出课表 ---------- */}
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
        <Card>
          <CardHeader>
            <div className="kicker"><strong>Export</strong></div>
            <CardTitle>导出课表</CardTitle>
            <CardDescription>ICS 可导入系统日历；WakeUp 文件可导入 WakeUp 应用，不会上传到任何第三方。学期周一留空则按学校校历自动确定。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="sm">学期周一（可留空）</Label>
                <Input id="sm" type="date" value={semesterMonday} onChange={(e) => setSemesterMonday(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="weeks">学期周数</Label>
                <Input
                  id="weeks"
                  type="number"
                  min={1}
                  max={30}
                  value={weeksDraft}
                  onChange={(e) => setWeeksDraft(e.target.value)}
                  onBlur={commitWeeks}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="campus">校区</Label>
                <Select id="campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="main">广州主校区</option>
                  <option value="shunde">顺德校区</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportIcs} disabled={!session || exporting} loading={exporting === "ics"}>
                <Download className="w-4 h-4" /> 导出 ICS
              </Button>
              <Button variant="outline" onClick={exportWakeup} disabled={!session || exporting} loading={exporting === "wakeup"}>
                <ImageIcon className="w-4 h-4" /> 导出 WakeUp 文件
              </Button>
              {!session && <span className="text-[13px] text-[var(--muted)] self-center">需先登录学校系统</span>}
            </div>
            {exportError && <Alert variant="warning" title="导出失败">{exportError}</Alert>}
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- 分享到 WakeUp ---------- */}
      <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
        <Card data-component="WakeupShare" data-od-id="wakeup-share">
          <CardHeader>
            <div className="kicker"><strong>Wakeup Share</strong></div>
            <CardTitle>分享到 WakeUp</CardTitle>
            <CardDescription>直接把课表上传到 WakeUp 应用，生成分享口令后即可在 App 中导入。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="info" title="需要你确认">
              这会把你的课表上传到 WakeUp。如果不想上传，可以用上方的"导出 WakeUp 文件"下载后手动导入。
            </Alert>
            <label className="inline-flex items-start gap-2 text-[13px] text-foreground cursor-pointer select-none">
              <Checkbox checked={shareConsent} onChange={setShareConsent} className="mt-0.5" />
              <span>我已了解这会把课表上传到 WakeUp，并同意继续。</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={shareToWakeup} disabled={!session || !shareConsent || sharing} loading={sharing}>
                <Share2 className="w-4 h-4" /> 分享到 WakeUp
              </Button>
              {!session && <span className="text-[13px] text-[var(--muted)] self-center">需先登录学校系统</span>}
            </div>
            {shareError && <Alert variant="warning" title="分享失败">{shareError}</Alert>}
            {shareCode && (
              <Alert variant="success" title="分享成功">
                <div className="flex flex-col gap-2">
                  <span>复制下面整段分享口令（30 分钟内有效），打开 WakeUp 主界面右上角第二个按钮 → 从分享口令导入。</span>
                  <Textarea ref={shareInputRef} value={shareMessage} readOnly rows={4} className="text-[13px]" />
                  <Button variant="outline" size="sm" onClick={copyShareMessage} className="self-start">
                    {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
                    {copied ? "已复制" : "复制完整分享口令"}
                  </Button>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
