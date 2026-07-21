// Canvas design runtime editable source marker: auth-pages
import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ShieldCheck, KeyRound, Mail, ListChecks, AlertTriangle, ArrowRight } from "lucide-react";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Alert, Badge, cn } from "@/components/ui.jsx";
import { useTurnstile } from "@/lib/api.jsx";

const QUIZ_QUESTIONS = [
  { id: 0, q: "南医大广州主校区位于哪个区？", options: ["海珠区", "番禺区", "白云区", "天河区"] },
  { id: 1, q: "顺德校区所在城市是？", options: ["佛山", "珠海", "东莞", "中山"] },
  { id: 2, q: "教学信息服务平台简称？", options: ["UIS", "JWC", "JWXT", "EDU"] },
  { id: 3, q: "学习舱预约开放时间为？", options: ["次日 22:00", "当日 22:00", "次日 06:00", "当日 18:00"] },
];

function TurnstileSlot() {
  // 演示 RATE_LIMIT_CHALLENGE_REQUIRED 时按需加载的人机验证槽位
  const { challenge } = useTurnstile();
  return (
    <div data-component="TurnstileSlot" data-od-id="turnstile" className="rounded-[var(--radius)] border border-dashed border-[color-mix(in_srgb,var(--seed-primary)_40%,transparent)] bg-[var(--primary-muted)] p-4 flex items-center gap-3">
      <ShieldCheck className="w-5 h-5 text-[var(--seed-primary-strong)]" />
      <div className="text-[13px] leading-[1.5]">
        <div className="font-medium text-[var(--seed-primary-strong)] tracking-[0.01em]">人机验证已触发</div>
        <div className="text-[var(--muted)]">系统检测到需要验证时自动出现，完成后 5 分钟内有效。</div>
      </div>
      <div className="ml-auto w-[140px] h-[42px] rounded-[var(--radius-sm)] bg-[var(--seed-surface)] border border-border flex items-center justify-center text-[11px] text-[var(--muted)] tracking-[0.06em] uppercase">验证中</div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // 敏感态：仅内存
  const [loading, setLoading] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // 设计预览：演示触发 Turnstile 软阈值
    setTimeout(() => {
      setChallengeOpen(true);
      setLoading(false);
    }, 400);
  };

  return (
    <Card className="w-full max-w-md" data-component="LoginForm" data-od-id="login">
      <CardHeader>
        <Badge variant="default" className="self-start">平台账号</Badge>
        <CardTitle className="mt-2">登录南医工具台</CardTitle>
        <CardDescription>登录信息由系统安全保存，密码仅用于本次登录。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u">用户名</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="学号或注册用户名" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p">密码</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="8–128 字符" />
          </div>
          <Button type="submit" loading={loading} className="w-full">登录</Button>
        </form>
        {challengeOpen && <TurnstileSlot />}
        <div className="text-[13px] text-[var(--muted)] text-center">
          没有账号？<Link to="/auth/register" className="text-[var(--seed-primary-strong)] underline underline-offset-2">注册</Link>
        </div>
      </CardContent>
    </Card>
  );
}

function QuizRegister() {
  const [answers, setAnswers] = useState(() => Array(QUIZ_QUESTIONS.length).fill(null));
  const [submitted, setSubmitted] = useState(false);
  const remaining = QUIZ_QUESTIONS.length - answers.filter((a) => a !== null).length;

  const pick = (qi, opt) => setAnswers((prev) => { const n = [...prev]; n[qi] = opt; return n; });

  return (
    <Card className="w-full max-w-2xl" data-component="QuizRegister" data-od-id="register-quiz">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="default"><ListChecks className="w-3 h-3" /> 校内答题</Badge>
          <Badge variant="muted">15:00 剩余 · 第 2/5 次</Badge>
        </div>
        <CardTitle className="mt-2">校内答题注册</CardTitle>
        <CardDescription>20 道校内常识题，答对 18 题即可通过。限时 15 分钟，最多可答 5 次。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-[13px]">
          <div className="flex-1 h-1.5 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
            <div className="h-full bg-[var(--seed-primary)]" style={{ width: `${((QUIZ_QUESTIONS.length - remaining) / QUIZ_QUESTIONS.length) * 100}%` }} />
          </div>
          <span className="text-[var(--muted)] tabular-nums">{QUIZ_QUESTIONS.length - remaining}/{QUIZ_QUESTIONS.length}</span>
        </div>
        {QUIZ_QUESTIONS.map((item, i) => (
          <div key={item.id} className="rounded-[var(--radius)] border border-border p-4">
            <div className="text-[13px] text-[var(--muted)] tracking-[0.06em] uppercase mb-1">第 {item.id + 1} 题</div>
            <div className="text-sm font-medium mb-3 tracking-[0.01em]">{item.q}</div>
            <div className="grid grid-cols-2 gap-2">
              {item.options.map((opt, oi) => {
                const sel = answers[i] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => pick(i, oi)}
                    className={cn(
                      "text-left text-[13px] px-3 py-2 rounded-[var(--radius-sm)] border transition-colors",
                      sel ? "border-[var(--seed-primary)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)]" : "border-border hover:bg-[var(--seed-surface-2)]"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <Alert variant="info" title="关于题号">
          题号仅为本轮答题的顺序编号。若 5 次均未通过，需重新开始新一轮答题。
        </Alert>
        <Button onClick={() => setSubmitted(true)} disabled={remaining > 0} className="self-end">
          提交验证 <ArrowRight className="w-4 h-4" />
        </Button>
        {submitted && <Alert variant="success" title="验证通过">已通过 18/20，可继续完成注册。</Alert>}
      </CardContent>
    </Card>
  );
}

function EmailRegister() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(""); // 敏感态：仅内存
  const [sent, setSent] = useState(false);

  return (
    <Card className="w-full max-w-md" data-component="EmailRegister" data-od-id="register-email">
      <CardHeader>
        <Badge variant="default" className="self-start"><Mail className="w-3 h-3" /> 教育邮箱</Badge>
        <CardTitle className="mt-2">教育邮箱注册</CardTitle>
        <CardDescription>仅支持 .edu.cn 教育邮箱注册。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="em">教育邮箱</Label>
          <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@stu.smu.edu.cn" />
        </div>
        <Button variant="outline" onClick={() => setSent(true)} disabled={!email}>发送验证码</Button>
        {sent && (
          <Alert variant="info" title="验证码已发送">
            已发送至 l***@stu.smu.edu.cn，请查收邮件并在此输入验证码。
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c">验证码</Label>
          <Input id="c" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6 位数字" />
        </div>
        <Button className="w-full">完成注册</Button>
      </CardContent>
    </Card>
  );
}

/* ---- 装饰：登录/注册页左侧角色立绘占位 ----
   以后替换为二次元角色立绘（建议 280×360，透明背景 PNG）。   */
function AuthPanelArt() {
  return (
    <svg viewBox="0 0 280 340" fill="none" className="w-full max-w-[280px]" aria-hidden="true">
      {/* 光环 */}
      <circle cx="140" cy="105" r="68" fill="color-mix(in srgb, var(--seed-primary) 10%, transparent)" />
      <circle cx="140" cy="105" r="52" fill="color-mix(in srgb, var(--seed-primary) 6%, transparent)" />
      {/* 漂浮书本 */}
      <g transform="translate(38, 55) rotate(-12)">
        <rect x="0" y="0" width="38" height="28" rx="3" fill="var(--seed-surface-2)" stroke="var(--seed-border)" stroke-width="1.2" />
        <line x1="19" y1="2" x2="19" y2="26" stroke="var(--seed-border)" stroke-width="1" />
        <rect x="4" y="7" width="11" height="2" rx="1" fill="var(--seed-border)" opacity="0.6" />
        <rect x="4" y="12" width="9" height="2" rx="1" fill="var(--seed-border)" opacity="0.4" />
      </g>
      {/* 漂浮医学十字 */}
      <g transform="translate(225, 48)">
        <circle cx="0" cy="0" r="19" fill="color-mix(in srgb, var(--seed-primary) 14%, transparent)" />
        <rect x="-3" y="-10" width="6" height="20" rx="1.5" fill="var(--seed-primary)" opacity="0.75" />
        <rect x="-10" y="-3" width="20" height="6" rx="1.5" fill="var(--seed-primary)" opacity="0.75" />
      </g>
      {/* 漂浮毕业帽 */}
      <g transform="translate(232, 155)">
        <path d="M-16 -6 L0 -14 L16 -6 L0 2 Z" fill="var(--seed-success)" opacity="0.8" />
        <path d="M-10 -4 L-10 6 Q-10 9 0 9 Q10 9 10 6 L10 -4" fill="var(--seed-success)" opacity="0.5" stroke="none" />
        <line x1="10" y1="-4" x2="19" y2="-10" stroke="var(--seed-success)" stroke-width="1.5" />
        <circle cx="20" cy="-11" r="2.8" fill="var(--seed-warning)" />
      </g>
      {/* 头发后 */}
      <path d="M82 108 Q78 65 140 62 Q202 65 198 108 L198 142 Q198 148 192 148 L88 148 Q82 148 82 142 Z" fill="var(--seed-primary)" opacity="0.82" />
      {/* 脸 */}
      <ellipse cx="140" cy="115" rx="34" ry="37" fill="#fff2e5" />
      {/* 刘海 */}
      <path d="M106 95 Q116 82 134 85 Q124 90 122 100 Q116 90 106 95Z" fill="var(--seed-primary)" opacity="0.82" />
      <path d="M174 95 Q164 82 146 85 Q156 90 158 100 Q164 90 174 95Z" fill="var(--seed-primary)" opacity="0.82" />
      {/* 眼睛（笑眯眯） */}
      <path d="M124 118 Q128 122 132 118" stroke="var(--seed-fg)" stroke-width="2" stroke-linecap="round" fill="none" />
      <path d="M148 118 Q152 122 156 118" stroke="var(--seed-fg)" stroke-width="2" stroke-linecap="round" fill="none" />
      {/* 腮红 */}
      <ellipse cx="118" cy="128" rx="6" ry="3.5" fill="color-mix(in srgb, var(--seed-primary) 22%, transparent)" />
      <ellipse cx="162" cy="128" rx="6" ry="3.5" fill="color-mix(in srgb, var(--seed-primary) 22%, transparent)" />
      {/* 微笑 */}
      <path d="M132 130 Q140 136 148 130" stroke="var(--seed-fg)" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.55" />
      {/* 白大褂 */}
      <path d="M85 150 L80 280 Q80 292 92 292 L188 292 Q200 292 200 280 L195 150 Z" fill="#fffbf5" stroke="var(--seed-border)" stroke-width="1.5" />
      {/* 领口 V */}
      <path d="M122 150 L140 180 L158 150" stroke="var(--seed-primary)" stroke-width="3" stroke-linecap="round" fill="none" />
      {/* 内搭 */}
      <path d="M122 150 L140 180 L158 150 L152 150 L140 168 L128 150 Z" fill="color-mix(in srgb, var(--seed-success) 15%, var(--seed-bg))" />
      {/* 医学十字胸章 */}
      <g transform="translate(140, 215)">
        <rect x="-4.5" y="-14" width="9" height="28" rx="2" fill="var(--seed-primary)" opacity="0.75" />
        <rect x="-14" y="-4.5" width="28" height="9" rx="2" fill="var(--seed-primary)" opacity="0.75" />
      </g>
      {/* 口袋 */}
      <rect x="162" y="225" width="22" height="24" rx="2" fill="none" stroke="var(--seed-border)" stroke-width="1.2" opacity="0.6" />
      {/* 挥手（右手举起） */}
      <path d="M195 154 Q230 130 245 100" fill="none" stroke="var(--seed-border)" stroke-width="1.5" />
      <circle cx="247" cy="97" r="9" fill="#fff2e5" stroke="var(--seed-border)" stroke-width="1.2" />
      {/* 左手 */}
      <path d="M85 154 Q70 190 76 225" fill="none" stroke="var(--seed-border)" stroke-width="1.5" />
      {/* 闪光 */}
      <g opacity="0.5">
        <path d="M55 200 L57.5 206 L63 208.5 L57.5 211 L55 217 L52.5 211 L47 208.5 L52.5 206 Z" fill="var(--seed-primary)" />
        <path d="M255 230 L256.5 235 L261 236.5 L256.5 238 L255 243 L253.5 238 L249 236.5 L253.5 235 Z" fill="var(--seed-success)" />
        <circle cx="50" cy="100" r="2.5" fill="var(--seed-primary)" opacity="0.6" />
        <circle cx="210" cy="200" r="3" fill="var(--seed-warning)" opacity="0.5" />
        <circle cx="60" cy="270" r="2" fill="var(--seed-success)" opacity="0.5" />
      </g>
    </svg>
  );
}

export default function AuthPages({ mode }) {
  const [tab, setTab] = useState("quiz");
  return (
    <div className="min-h-screen flex">
      {/* 左侧装饰区 —— 桌面端显示，以后可放二次元立绘 */}
      <div
        className="hidden lg:flex w-[42%] max-w-[520px] flex-col justify-center items-center p-8 relative overflow-hidden border-r border-border bg-gradient-to-br from-[var(--seed-surface)] via-[var(--seed-bg)] to-[color-mix(in_srgb,var(--seed-primary)_8%,var(--seed-bg))]"
        data-character-slot="auth-panel"
      >
        {/* 背景装饰 */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 400 600" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="350" cy="80" r="80" fill="var(--seed-primary)" />
          <circle cx="50" cy="500" r="100" fill="var(--seed-success)" />
          <circle cx="380" cy="450" r="60" fill="var(--seed-primary)" />
          <path d="M0 200 Q100 150 200 200 T400 200" stroke="var(--seed-primary)" stroke-width="3" fill="none" />
          <path d="M0 400 Q120 350 240 400 T400 400" stroke="var(--seed-success)" stroke-width="3" fill="none" />
        </svg>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <AuthPanelArt />
          <div className="text-center">
            <div className="font-display text-[1.75rem] font-medium tracking-[-0.02em]">南医工具台</div>
            <div className="text-sm text-[var(--muted)] mt-1">课表、选课、评课、学习舱 · 一站搞定</div>
          </div>
        </div>
      </div>
      {/* 右侧表单区 */}
      <div className="flex-1 flex items-center justify-center p-4 warm-grain">
        <div className="w-full max-w-2xl flex flex-col items-center gap-5">
          {/* 移动端品牌 */}
          <div className="lg:hidden flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-gradient-to-br from-[var(--seed-primary)] to-[color-mix(in_srgb,var(--seed-primary)_75%,var(--seed-accent))] text-[var(--primary-foreground)] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M12 8v4M10 10h4" />
              </svg>
            </div>
            <span className="font-display text-base font-semibold">南医工具台</span>
          </div>
          {mode === "login" ? <LoginForm /> : (
            <div className="w-full flex flex-col items-center gap-4">
              <Tabs value={tab} onValueChange={setTab} options={[
                { value: "quiz", label: "校内答题" },
                { value: "email", label: "教育邮箱" },
              ]} />
              {tab === "quiz" ? <QuizRegister /> : <EmailRegister />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* 简易 Tabs（内联，避免再开文件） */
function Tabs({ value, onValueChange, options }) {
  return (
    <div className="inline-flex p-1 rounded-[var(--radius-full)] border border-border bg-[var(--seed-surface)]" data-component="Tabs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onValueChange(o.value)}
          className={cn(
            "px-4 h-8 rounded-[var(--radius-full)] text-[13px] tracking-[0.01em] transition-colors",
            value === o.value ? "bg-[var(--seed-primary)] text-[var(--primary-foreground)] font-medium" : "text-[var(--muted)] hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
