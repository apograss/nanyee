// Canvas design runtime editable source marker: grades
import React, { useState, useEffect, useCallback } from "react";
import { GraduationCap, ShieldCheck, TrendingUp, BarChart3, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Table, Alert, Badge, cn } from "@/components/ui.jsx";
import { apiGet, apiPost, mockGrades } from "@/lib/api.jsx";

function RankBadge({ ranking, ...qoderProps }) {
  if (!ranking) return <span className={["text-[var(--muted)] text-[13px]", qoderProps?.className].filter(Boolean).join(" ")} style={qoderProps?.style} data-qoder-id={qoderProps?.["data-qoder-id"]} data-qoder-source={qoderProps?.["data-qoder-source"]}>—</span>;
  const { class_rank, class_total, course_rank, course_total, distribution } = ranking;
  const dist = distribution || {};
  const segments = [
    { v: dist.gte90 || 0, color: "var(--seed-primary)", label: "≥90" },
    { v: dist.s80to90 || 0, color: "color-mix(in srgb, var(--seed-primary) 70%, var(--seed-bg))", label: "80-89" },
    { v: dist.s70to80 || 0, color: "var(--seed-success)", label: "70-79" },
    { v: dist.s60to70 || 0, color: "color-mix(in srgb, var(--seed-warning) 60%, var(--seed-bg))", label: "60-69" },
    { v: dist.lt60 || 0, color: "var(--danger)", label: "<60" },
  ];
  const total = segments.reduce((a, b) => a + b.v, 0) || 1;
  return (
    <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-e8c789da" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-e8c789da&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:20,&quot;column&quot;:5}}">
      <div className="flex gap-2 text-[11px]" data-qoder-id="qel-flex-e9c78b6d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-e9c78b6d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:21,&quot;column&quot;:7}}">
        <span className="text-[var(--seed-primary-strong)] font-medium" data-qoder-id="qel-text-var-seed-primary-strong-581cbfaa" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-var-seed-primary-strong-581cbfaa&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;text-var-seed-primary-strong&quot;,&quot;loc&quot;:{&quot;line&quot;:22,&quot;column&quot;:9}}">班级 {class_rank}/{class_total}</span>
        <span className="text-[var(--muted)]" data-qoder-id="qel-text-var-muted-36d049f0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-var-muted-36d049f0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;text-var-muted&quot;,&quot;loc&quot;:{&quot;line&quot;:23,&quot;column&quot;:9}}">课程 {course_rank}/{course_total}</span>
      </div>
      {total > 1 && (
        <div className="flex h-1.5 w-[120px] rounded-[var(--radius-full)] overflow-hidden" data-component="DistributionBar" data-qoder-id="qel-distributionbar-ab735108" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-distributionbar-ab735108&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;distributionbar&quot;,&quot;loc&quot;:{&quot;line&quot;:26,&quot;column&quot;:9}}">
          {segments.map((s, i) => s.v > 0 && (
            <div key={i} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.v}人`}  data-qoder-id="qel-div-d49f706f" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-d49f706f&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;RankBadge&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:28,&quot;column&quot;:13}}"/>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Grades(qoderProps) {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState(null);
  const [error, setError] = useState("");

  const fetchCaptcha = useCallback(async () => {
    try {
      const data = await apiGet("/smu/captcha", {
        mock: { flow_id: "flow_demo_001", image_base64: "iVBORw0KGgoAAAANSUhEUgAAAFAAAAAcCAYAAAABqWjNAAAACXBIWXMAAA7DAAAOwwHHb6kHAAAAJ0lEQVR4nO3BMQEAAADCoPdpr0IDyUBRcKPQo1MBBqVQAwAXjCQBAOerCgAAAABJRU5ErkJggg==", content_type: "image/png", expires_at: new Date(Date.now() + 120000).toISOString() },
      });
      const dataUrl = `data:${data.content_type};base64,${data.image_base64}`;
      setCaptcha({ flow_id: data.flow_id, dataUrl, expires_at: data.expires_at });
      setCaptchaCode("");
    } catch { setCaptcha(null); }
  }, []);

  useEffect(() => { if (!session) fetchCaptcha(); }, [session, fetchCaptcha]);

  const login = async () => {
    setLoading(true);
    setError("");
    try {
      const sess = await apiPost("/smu/session", { flow_id: captcha?.flow_id, account, password, captcha: captchaCode }, {
        mock: { academic_session_id: "as_demo_001", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      });
      setSession(sess);
      setPassword(""); setCaptchaCode("");
      const data = await apiPost("/smu/grades", { academic_session_id: sess.academic_session_id }, { mock: mockGrades });
      setGrades(data);
    } catch (err) {
      setError(err?.message || "登录失败，请检查输入后重试。");
      fetchCaptcha();
    }
    setLoading(false);
  };

  const s = grades?.summary;

  return (
    <div className={["max-w-6xl mx-auto flex flex-col gap-5", qoderProps?.className].filter(Boolean).join(" ")} data-component="GradesPage" data-od-id="grades" style={qoderProps?.style} data-qoder-id={qoderProps?.["data-qoder-id"]} data-qoder-source={qoderProps?.["data-qoder-source"]}>
      <div className="flex flex-col gap-1" data-qoder-id="qel-flex-9194a89a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-9194a89a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:62,&quot;column&quot;:7}}">
        <div className="text-[11px] tracking-[0.1em] uppercase text-[var(--muted)]" data-qoder-id="qel-text-11px-9a7dbc67" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-9a7dbc67&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:63,&quot;column&quot;:9}}">学校工具</div>
        <h1 data-qoder-id="qel-h1-26826d83" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-h1-26826d83&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;h1&quot;,&quot;loc&quot;:{&quot;line&quot;:64,&quot;column&quot;:9}}">成绩查询</h1>
        <p className="text-[var(--muted)] text-sm" data-qoder-id="qel-text-var-muted-27f2ba91" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-var-muted-27f2ba91&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-var-muted&quot;,&quot;loc&quot;:{&quot;line&quot;:65,&quot;column&quot;:9}}">成绩不会保存在服务器，查询结果包含班级和课程排名。</p>
      </div>

      {!session ? (
        <Card data-qoder-id="qel-card-3cdc14c7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-card-3cdc14c7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;card&quot;,&quot;loc&quot;:{&quot;line&quot;:69,&quot;column&quot;:9}}">
          <CardHeader data-qoder-id="qel-cardheader-a05c13d8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardheader-a05c13d8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;cardheader&quot;,&quot;loc&quot;:{&quot;line&quot;:70,&quot;column&quot;:11}}">
            <CardTitle data-qoder-id="qel-cardtitle-8a28de39" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-8a28de39&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:71,&quot;column&quot;:13}}">学校系统登录</CardTitle>
            <CardDescription data-qoder-id="qel-carddescription-88c73238" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-88c73238&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:72,&quot;column&quot;:13}}">验证码仅用一次，学校密码只用于本次登录。</CardDescription>
          </CardHeader>
          <CardContent data-qoder-id="qel-cardcontent-854a04a3" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardcontent-854a04a3&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;cardcontent&quot;,&quot;loc&quot;:{&quot;line&quot;:74,&quot;column&quot;:11}}">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end" data-qoder-id="qel-grid-24412f27" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-24412f27&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:75,&quot;column&quot;:13}}">
              <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-cff1f0e1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-cff1f0e1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:76,&quot;column&quot;:15}}">
                <Label data-qoder-id="qel-label-1e7d73a1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-1e7d73a1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:77,&quot;column&quot;:17}}">学号</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001"  data-qoder-id="qel-input-d0287ee6" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-d0287ee6&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:78,&quot;column&quot;:17}}"/>
              </div>
              <div className="flex flex-col gap-1.5" data-qoder-id="qel-flex-5eef0067" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-5eef0067&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;flex&quot;,&quot;loc&quot;:{&quot;line&quot;:80,&quot;column&quot;:15}}">
                <Label data-qoder-id="qel-label-1b7d6ee8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-label-1b7d6ee8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;label&quot;,&quot;loc&quot;:{&quot;line&quot;:81,&quot;column&quot;:17}}">学校密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="仅本次请求"  data-qoder-id="qel-input-d52886c5" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-input-d52886c5&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;input&quot;,&quot;loc&quot;:{&quot;line&quot;:82,&quot;column&quot;:17}}"/>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>验证码</Label>
                <div className="flex items-center gap-2">
                  {captcha ? (
                    <img src={captcha.dataUrl} alt="验证码" className="h-9 rounded-[var(--radius)] border border-border" />
                  ) : (
                    <div className="h-9 w-[100px] rounded-[var(--radius)] border border-border flex items-center justify-center text-[11px] text-[var(--muted)]">加载中…</div>
                  )}
                  <Button type="button" variant="ghost" size="icon" onClick={fetchCaptcha} aria-label="刷新验证码"><RefreshCw className="w-4 h-4" /></Button>
                  <Input value={captchaCode} onChange={(e) => setCaptchaCode(e.target.value)} placeholder="输入图中字符" className="flex-1" />
                </div>
              </div>
            </div>
            <div className="mt-3"><Button onClick={login} loading={loading} disabled={!captcha || !account || !password || !captchaCode}>登录并查询</Button></div>
            {error && <Alert variant="danger" title="登录失败"><span>{error}</span></Alert>}
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="success" title="登录成功" data-qoder-id="qel-alert-7b7ce770" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-7b7ce770&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:94,&quot;column&quot;:11}}">
            <span data-qoder-id="qel-span-5f650723" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-5f650723&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:95,&quot;column&quot;:13}}">24 小时内可查询，过期后需重新登录。</span>
          </Alert>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-qoder-id="qel-grid-ae3bf837" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-grid-ae3bf837&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;grid&quot;,&quot;loc&quot;:{&quot;line&quot;:98,&quot;column&quot;:11}}">
            {[
              { k: "总学分", v: s?.total_credits?.toFixed(1) || "—", s: `${s?.total_courses || 0} 门` },
              { k: "加权绩点", v: s?.weighted_gpa?.toFixed(2) || "—", s: `必修 ${s?.required_gpa?.toFixed(2) || "—"}` },
              { k: "加权均分", v: s?.average_score?.toFixed(1) || "—", s: `必修 ${s?.required_average_score?.toFixed(1) || "—"}` },
              { k: "挂科数", v: String(s?.failed_count || 0), s: s?.failed_count === 0 ? "全部通过" : "需关注" },
            ].map((m) => (
              <Card key={m.k} data-component="GradeStat" data-od-id={`stat-${m.k}`} data-qoder-id="qel-gradestat-71c66e16" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-gradestat-71c66e16&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;gradestat&quot;,&quot;loc&quot;:{&quot;line&quot;:105,&quot;column&quot;:15}}">
                <CardContent className="p-4" data-qoder-id="qel-p-4-7a164a8e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-p-4-7a164a8e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;p-4&quot;,&quot;loc&quot;:{&quot;line&quot;:106,&quot;column&quot;:17}}">
                  <div className="text-[11px] tracking-[0.08em] uppercase text-[var(--muted)]" data-qoder-id="qel-text-11px-89792476" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-89792476&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:107,&quot;column&quot;:19}}">{m.k}</div>
                  <div className="font-display text-[1.75rem] tracking-[-0.02em] text-foreground mt-1 tabular-nums" data-qoder-id="qel-font-display-456f38ed" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-font-display-456f38ed&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;font-display&quot;,&quot;loc&quot;:{&quot;line&quot;:108,&quot;column&quot;:19}}">{m.v}</div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5" data-qoder-id="qel-text-11px-87792150" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-11px-87792150&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-11px&quot;,&quot;loc&quot;:{&quot;line&quot;:109,&quot;column&quot;:19}}">{m.s}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card data-qoder-id="qel-card-a9d6b030" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-card-a9d6b030&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;card&quot;,&quot;loc&quot;:{&quot;line&quot;:115,&quot;column&quot;:11}}">
            <CardHeader className="flex-row items-start justify-between" data-qoder-id="qel-flex-row-7f8b472a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-flex-row-7f8b472a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;flex-row&quot;,&quot;loc&quot;:{&quot;line&quot;:116,&quot;column&quot;:13}}">
              <div data-qoder-id="qel-div-c5dda7fb" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-div-c5dda7fb&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;div&quot;,&quot;loc&quot;:{&quot;line&quot;:117,&quot;column&quot;:15}}">
                <CardTitle data-qoder-id="qel-cardtitle-8a35aa2c" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardtitle-8a35aa2c&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;cardtitle&quot;,&quot;loc&quot;:{&quot;line&quot;:118,&quot;column&quot;:17}}">成绩明细</CardTitle>
                <CardDescription data-qoder-id="qel-carddescription-0ed33e1d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-carddescription-0ed33e1d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;carddescription&quot;,&quot;loc&quot;:{&quot;line&quot;:119,&quot;column&quot;:17}}">排名包含班级和课程范围，分布为各分段人数。</CardDescription>
              </div>
              <Badge variant="muted" className="gap-1" data-qoder-id="qel-gap-1-db6db621" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-gap-1-db6db621&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;gap-1&quot;,&quot;loc&quot;:{&quot;line&quot;:121,&quot;column&quot;:15}}"><BarChart3 className="w-3 h-3"  data-qoder-id="qel-w-3-6a0d1bdc" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-3-6a0d1bdc&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;w-3&quot;,&quot;loc&quot;:{&quot;line&quot;:121,&quot;column&quot;:56}}"/> 含排名分布</Badge>
            </CardHeader>
            <CardContent data-qoder-id="qel-cardcontent-035603f0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-cardcontent-035603f0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;cardcontent&quot;,&quot;loc&quot;:{&quot;line&quot;:123,&quot;column&quot;:13}}">
              <div className="w-full overflow-x-auto rounded-[var(--radius)] border border-border" data-qoder-id="qel-w-full-dc9dc7e7" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-full-dc9dc7e7&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;w-full&quot;,&quot;loc&quot;:{&quot;line&quot;:124,&quot;column&quot;:15}}">
                <table className="w-full text-sm" data-qoder-id="qel-w-full-1bc31753" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-w-full-1bc31753&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;w-full&quot;,&quot;loc&quot;:{&quot;line&quot;:125,&quot;column&quot;:17}}">
                  <thead className="bg-[var(--seed-surface-2)]" data-qoder-id="qel-bg-var-seed-surface-2-95b5f2c3" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-bg-var-seed-surface-2-95b5f2c3&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;bg-var-seed-surface-2&quot;,&quot;loc&quot;:{&quot;line&quot;:126,&quot;column&quot;:19}}">
                    <tr data-qoder-id="qel-tr-28717ebc" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-tr-28717ebc&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;tr&quot;,&quot;loc&quot;:{&quot;line&quot;:127,&quot;column&quot;:21}}">
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-68ba0549" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-68ba0549&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:128,&quot;column&quot;:23}}">课程</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-67ba03b6" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-67ba03b6&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:129,&quot;column&quot;:23}}">学期</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-66ba0223" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-66ba0223&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:130,&quot;column&quot;:23}}">学分</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-65ba0090" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-65ba0090&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:131,&quot;column&quot;:23}}">成绩</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-6cba0b95" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-6cba0b95&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:132,&quot;column&quot;:23}}">绩点</th>
                      <th className="text-left font-medium tracking-[0.01em] text-[var(--muted)] px-4 py-2.5 text-[13px] whitespace-nowrap" data-qoder-id="qel-text-left-6bba0a02" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-text-left-6bba0a02&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;text-left&quot;,&quot;loc&quot;:{&quot;line&quot;:133,&quot;column&quot;:23}}">排名与分布</th>
                    </tr>
                  </thead>
                  <tbody data-qoder-id="qel-tbody-e638a594" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-tbody-e638a594&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;tbody&quot;,&quot;loc&quot;:{&quot;line&quot;:136,&quot;column&quot;:19}}">
                    {(grades?.grades || []).map((g, i) => (
                      <tr key={i} className="border-t border-border hover:bg-[var(--seed-surface-2)]" data-qoder-id="qel-border-t-5e11a8f0" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-border-t-5e11a8f0&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;border-t&quot;,&quot;loc&quot;:{&quot;line&quot;:138,&quot;column&quot;:23}}">
                        <td className="px-4 py-3" data-qoder-id="qel-px-4-3146e21d" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-3146e21d&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:139,&quot;column&quot;:25}}"><span className="font-medium text-[13px]" data-qoder-id="qel-font-medium-45fa7aba" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-font-medium-45fa7aba&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;font-medium&quot;,&quot;loc&quot;:{&quot;line&quot;:139,&quot;column&quot;:51}}">{g.name}</span></td>
                        <td className="px-4 py-3 text-[13px] text-[var(--muted)]" data-qoder-id="qel-px-4-af49e70e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-af49e70e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:140,&quot;column&quot;:25}}">{g.semester || "—"}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums" data-qoder-id="qel-px-4-b049e8a1" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-b049e8a1&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:141,&quot;column&quot;:25}}">{g.credits}</td>
                        <td className="px-4 py-3 text-[13px] font-medium tabular-nums" data-qoder-id="qel-px-4-ad49e3e8" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-ad49e3e8&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:142,&quot;column&quot;:25}}">{g.raw_score}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums" data-qoder-id="qel-px-4-ae49e57b" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-ae49e57b&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:143,&quot;column&quot;:25}}">{g.grade_point?.toFixed(1)}</td>
                        <td className="px-4 py-3" data-qoder-id="qel-px-4-b349ed5a" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-px-4-b349ed5a&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;px-4&quot;,&quot;loc&quot;:{&quot;line&quot;:144,&quot;column&quot;:25}}"><RankBadge ranking={g.ranking}  data-qoder-id="qel-rankbadge-93d30a6e" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-rankbadge-93d30a6e&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;rankbadge&quot;,&quot;loc&quot;:{&quot;line&quot;:144,&quot;column&quot;:51}}"/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Alert variant="info" title="默认不保存" data-qoder-id="qel-alert-13890fab" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-alert-13890fab&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;alert&quot;,&quot;loc&quot;:{&quot;line&quot;:153,&quot;column&quot;:11}}">
            <span data-qoder-id="qel-span-f5712c38" data-qoder-source="{&quot;qoderId&quot;:&quot;qel-span-f5712c38&quot;,&quot;filePath&quot;:&quot;react-vite/src/pages/Grades.jsx&quot;,&quot;componentName&quot;:&quot;Grades&quot;,&quot;elementRole&quot;:&quot;span&quot;,&quot;loc&quot;:{&quot;line&quot;:154,&quot;column&quot;:13}}">成绩不会保存在服务器，关闭页面后需重新登录查询。为保护隐私，成绩信息不存储、不上报。</span>
          </Alert>
        </>
      )}
    </div>
  );
}
