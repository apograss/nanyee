// Canvas design runtime editable source marker: timetable
import React, { useState, useEffect, useCallback, useRef } from "react";
import { CalendarDays, Download, Image as ImageIcon, Clock, RefreshCw, ScanLine, Copy, Check, Share2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Select, Badge, Alert, Checkbox, Spinner, cn } from "@/components/ui.jsx";
import { apiGet, apiPost, shareWakeup, CONFIRMATION_VERSIONS, mockCaptcha, mockSession, mockWakeupShare } from "@/lib/api.jsx";
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

const MOCK_COURSES = [
  { day: 0, sec: 1, len: 2, name: "有机化学", teacher: "陈老师", room: "教学楼 A301", weeks: "1-18" },
  { day: 2, sec: 3, len: 2, name: "病理学", teacher: "林老师", room: "科研楼 B205", weeks: "1-16" },
  { day: 1, sec: 5, len: 2, name: "诊断学", teacher: "王老师", room: "附属医院 C108", weeks: "1-18" },
  { day: 3, sec: 5, len: 2, name: "诊断学", teacher: "王老师", room: "附属医院 C108", weeks: "1-18" },
  { day: 4, sec: 8, len: 2, name: "医学英语", teacher: "李老师", room: "教学楼 A102", weeks: "3-14" },
];

const COLORS = ["bg-[var(--primary-muted)] text-[var(--seed-primary-strong)]", "bg-[var(--success-muted)] text-[var(--success)]"];

// 验证码 mock 字符（仅设计预览，与 inline SVG 一致；真实接口返回 base64 图像后由 ONNX 识别）
const MOCK_CAPTCHA_TEXT = "7294";

function CaptchaImage({ src }) {
  // 真实接口：src 为 data:image/png;base64,...；设计预览：src 为空时回退到 inline SVG
  if (src) {
    return (
      <div className="w-[120px] h-[48px] rounded-[var(--radius-sm)] border border-border bg-[var(--seed-surface)] flex items-center justify-center overflow-hidden shrink-0">
        <img src={src} alt="学校验证码" className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-[120px] h-[48px] rounded-[var(--radius-sm)] border border-border bg-[var(--seed-surface)] flex items-center justify-center overflow-hidden shrink-0">
      <svg viewBox="0 0 120 48" className="w-full h-full" aria-label="学校验证码（预览）">
        <rect width="120" height="48" fill="var(--seed-surface)" />
        <path d="M2 8 Q 30 24 60 14 T 118 22" stroke="color-mix(in srgb, var(--seed-muted) 30%, transparent)" fill="none" strokeWidth="1" />
        <path d="M4 38 Q 40 28 80 40 T 118 32" stroke="color-mix(in srgb, var(--seed-primary) 22%, transparent)" fill="none" strokeWidth="1" />
        <text x="14" y="32" fontFamily="var(--font-display)" fontSize="22" fill="var(--seed-fg)" transform="rotate(-6 14 32)">7</text>
        <text x="38" y="30" fontFamily="var(--font-display)" fontSize="22" fill="var(--seed-primary-strong)" transform="rotate(4 38 30)">2</text>
        <text x="62" y="33" fontFamily="var(--font-display)" fontSize="22" fill="var(--seed-fg)" transform="rotate(-3 62 33)">9</text>
        <text x="86" y="30" fontFamily="var(--font-display)" fontSize="22" fill="var(--seed-primary-strong)" transform="rotate(5 86 30)">4</text>
      </svg>
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

  const [week, setWeek] = useState(8);
  const [campus, setCampus] = useState("shunde");
  const [semesterMonday, setSemesterMonday] = useState("2026-09-07");
  const [exporting, setExporting] = useState(null); // "ics" | "wakeup" | null

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
      const data = await apiGet("/smu/captcha", { mock: mockCaptcha });
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

  // OCR 识别：仅在有真实图像时调用；设计预览（mock 无 image_base64）回退到 mock 文本
  const runOcr = useCallback(async (dataUrl) => {
    if (!dataUrl) {
      // 设计预览：mock 验证码无真实图像，回退到 mock 结果，仅用于演示交互
      setOcrLoading(true);
      await new Promise((r) => setTimeout(r, 450));
      setOcrResult({ text: MOCK_CAPTCHA_TEXT, confidence: 92.5, mock: true });
      setCaptcha(MOCK_CAPTCHA_TEXT);
      setOcrLoading(false);
      return;
    }
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
      const data = await apiPost("/smu/session", { flow_id: flowId, account, password, captcha }, { mock: mockSession });
      setSession({ academic_session_id: data.academic_session_id, expires_at: data.expires_at });
      setPassword(""); // 学校密码只用于本次登录请求，立即清空
      setCaptcha("");
      setOcrResult(null);
      setFlowId(null);
      setCaptchaDataUrl("");
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

  // 导出 ICS：POST /smu/timetable.ics { academic_session_id, total_weeks } → Blob 下载
  const exportIcs = async () => {
    if (!session) return;
    setExporting("ics");
    try {
      // 设计预览：模拟 Blob 下载
      await new Promise((r) => setTimeout(r, 600));
      // const blob = await apiPost("/smu/timetable.ics", { academic_session_id: session.academic_session_id, total_weeks: 20 });
      // saveAs(blob, "timetable.ics");
    } finally {
      setExporting(null);
    }
  };

  // 导出 WakeUp 文件：POST /smu/timetable.wakeup { academic_session_id, total_weeks, semester_monday, campus } → Blob 下载
  const exportWakeup = async () => {
    if (!session) return;
    setExporting("wakeup");
    try {
      await new Promise((r) => setTimeout(r, 600));
      // const blob = await apiPost("/smu/timetable.wakeup", { academic_session_id: session.academic_session_id, total_weeks: 20, semester_monday: semesterMonday, campus });
      // saveAs(blob, "timetable.wakeup_schedule");
    } finally {
      setExporting(null);
    }
  };

  // 分享到 WakeUp：POST /smu/timetable.wakeup.share { academic_session_id, semester_monday, campus, total_weeks, confirmation_version } → { share_code }
  // 额外提交 confirmation_version: "timetable:wakeup_share:v1"；该路径会把生成的课表上传到 WakeUp，需用户明确同意
  const shareToWakeup = async () => {
    if (!session || !shareConsent) return;
    setShareError(null);
    setSharing(true);
    setShareCode(null);
    try {
      const data = await shareWakeup({
        academic_session_id: session.academic_session_id,
        semester_monday: semesterMonday,
        campus,
        total_weeks: 20,
        confirmation_version: CONFIRMATION_VERSIONS.wakeupShare,
      }, { mock: mockWakeupShare });
      setShareCode(data.share_code);
    } catch (err) {
      setShareError(err.message || "分享失败，可改用本地文件导入");
    } finally {
      setSharing(false);
    }
  };

  const copyShareCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
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
    <div className="max-w-6xl mx-auto flex flex-col gap-5" data-component="TimetablePage" data-od-id="timetable">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]">学校查询</div>
        <h1>课表查询</h1>
        <p className="text-[var(--muted)] text-sm prose-body">用学校账号登录后即可查看课表，验证码可以自动识别，密码仅用于本次登录。</p>
      </div>

      {!session ? (
        <Card data-component="SchoolLogin" data-od-id="school-login">
          <CardHeader>
            <CardTitle>学校登录</CardTitle>
            <CardDescription>登录失败需重新输入验证码；学校密码只用于本次登录，不会保存。</CardDescription>
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
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="仅本次请求使用" required />
                </div>
              </div>
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
                    {ocrResult.mock && <Badge variant="muted" className="ml-1">预览</Badge>}
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
        <AcademicSessionCard session={session} onExpire={() => { setSession(null); fetchCaptcha(); }} />
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>第 {week} 周课表</CardTitle>
            <CardDescription>共 20 教学周；当前周次可切换。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(week)} onChange={(e) => setWeek(Number(e.target.value))} className="w-[110px]">
              {Array.from({ length: 20 }, (_, i) => <option key={i} value={i + 1}>第 {i + 1} 周</option>)}
            </Select>
            <Button variant="outline" size="icon" onClick={() => { setSession(null); fetchCaptcha(); }} aria-label="刷新会话" disabled={!session}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
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
                  const course = MOCK_COURSES.find((c) => c.day === di && c.sec === s.n);
                  return (
                    <div key={di} className="timetable-cell" style={course && course.len > 1 ? { gridRow: `span ${course.len}` } : undefined}>
                      {course && (
                        <div className={cn("rounded-[var(--radius-sm)] p-2 h-full", COLORS[di % 2])} data-component="CourseCell">
                          <div className="text-[12px] font-medium leading-tight">{course.name}</div>
                          <div className="text-[10px] mt-0.5 opacity-80">{course.room}</div>
                          <div className="text-[10px] opacity-70">{course.teacher} · {course.weeks}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>导出课表</CardTitle>
          <CardDescription>ICS 可导入系统日历；WakeUp 文件可导入 WakeUp 应用，不会上传到任何第三方。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="sm">学期周一</Label>
              <Input id="sm" type="date" value={semesterMonday} onChange={(e) => setSemesterMonday(e.target.value)} />
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
        </CardContent>
      </Card>

      <Card data-component="WakeupShare" data-od-id="wakeup-share">
        <CardHeader>
          <CardTitle>分享到 WakeUp</CardTitle>
          <CardDescription>直接把课表上传到 WakeUp 应用，生成分享码后即可在 App 中导入。</CardDescription>
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
                <span>分享码已生成，在 WakeUp 应用中导入即可。请尽快使用，码会过期。</span>
                <div className="flex items-center gap-2">
                  <Input ref={shareInputRef} value={shareCode} readOnly className="font-mono text-[13px]" />
                  <Button variant="outline" size="icon" onClick={copyShareCode} aria-label="复制分享码">
                    {copied ? <Check className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
