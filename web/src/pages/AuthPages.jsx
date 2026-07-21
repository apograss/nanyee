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

export default function AuthPages({ mode }) {
  const [tab, setTab] = useState("quiz");
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 warm-grain">
        <div className="w-full max-w-2xl flex flex-col items-center gap-5">
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
