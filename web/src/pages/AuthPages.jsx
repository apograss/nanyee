// Canvas design runtime editable source marker: auth-pages
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ShieldCheck, KeyRound, Mail, ListChecks, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Label, Alert, Badge, cn } from "@/components/ui.jsx";
import { useTurnstile, useAuth, apiPost } from "@/lib/api.jsx";

const MOCK_QUIZ_QUESTIONS = [
  { id: 0, q: "南医大广州主校区位于哪个区？", options: ["海珠区", "番禺区", "白云区", "天河区"] },
  { id: 1, q: "顺德校区所在城市是？", options: ["佛山", "珠海", "东莞", "中山"] },
  { id: 2, q: "教学信息服务平台简称？", options: ["UIS", "JWC", "JWXT", "EDU"] },
  { id: 3, q: "学习舱预约开放时间为？", options: ["次日 22:00", "当日 22:00", "次日 06:00", "当日 18:00"] },
];

function TurnstileSlot() {
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
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/login", { username, password }, {
        mock: { id: "usr_2c7f9a", username: "linyi", nickname: "林一", role: "student", status: "active", registration_trust_level: "community_quiz" },
      });
      await refresh();
      setPassword("");
      const from = location.state?.from || "/";
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === "RATE_LIMIT_CHALLENGE_REQUIRED") {
        setChallengeOpen(true);
      } else {
        setError(err?.message || "登录失败，请检查用户名和密码。");
      }
    }
    setLoading(false);
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
        {error && <Alert variant="danger" title="登录失败"><span>{error}</span></Alert>}
        <div className="text-[13px] text-[var(--muted)] text-center">
          没有账号？<Link to="/auth/register" className="text-[var(--seed-primary-strong)] underline underline-offset-2">注册</Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- 答题注册 ---------- */
function QuizRegister() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState(MOCK_QUIZ_QUESTIONS);
  const [challengeId, setChallengeId] = useState(null);
  const [answers, setAnswers] = useState(() => Array(MOCK_QUIZ_QUESTIONS.length).fill(null));
  const [phase, setPhase] = useState("quiz"); // quiz → verifying → verified → register → done
  const [verificationToken, setVerificationToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 拉取答题题目
  const fetchChallenges = useCallback(async () => {
    try {
      const data = await apiPost("/registration/challenges", { method: "community_quiz" }, {
        mock: { challenge_id: "ch_demo_001", questions: MOCK_QUIZ_QUESTIONS },
      });
      setChallengeId(data.challenge_id);
      if (data.questions?.length) {
        setQuestions(data.questions);
        setAnswers(Array(data.questions.length).fill(null));
      }
    } catch { /* 设计预览用本地题目 */ }
  }, []);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  const remaining = questions.length - answers.filter((a) => a !== null).length;
  const pick = (qi, opt) => setAnswers((prev) => { const n = [...prev]; n[qi] = opt; return n; });

  const verify = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/registration/verify", {
        challenge_id: challengeId,
        answers: answers.map((a, i) => ({ question_id: questions[i]?.id ?? i, answer_index: a })),
      }, {
        mock: { verification_token: "vt_demo_001", passed: true },
      });
      if (data.verification_token) {
        setVerificationToken(data.verification_token);
        setPhase("register");
      }
    } catch (err) {
      setError(err?.message || "答题验证失败，请重新作答。");
    }
    setLoading(false);
  };

  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      await apiPost("/registration", { verification_token: verificationToken, username, password }, {
        mock: { id: "usr_new", username, nickname: username, role: "student", status: "active", registration_trust_level: "community_quiz" },
      });
      setPhase("done");
      setPassword("");
    } catch (err) {
      setError(err?.message || "注册失败，请更换用户名重试。");
    }
    setLoading(false);
  };

  if (phase === "done") {
    return (
      <Card className="w-full max-w-md" data-component="QuizRegister" data-od-id="register-quiz">
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 className="w-10 h-10 text-[var(--success)]" />
          <div className="text-base font-medium">注册成功</div>
          <div className="text-[13px] text-[var(--muted)]">现在可以用新账号登录了。</div>
          <Button onClick={() => navigate("/auth/login")}>前往登录</Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "register") {
    return (
      <Card className="w-full max-w-md" data-component="QuizRegister" data-od-id="register-quiz">
        <CardHeader>
          <Badge variant="default" className="self-start">答题通过</Badge>
          <CardTitle className="mt-2">设置账号密码</CardTitle>
          <CardDescription>用户名 3–32 字符，密码 8–128 字符。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ru">用户名</Label>
            <Input id="ru" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–32 字符" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp">密码</Label>
            <Input id="rp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8–128 字符" />
          </div>
          {error && <Alert variant="danger" title="注册失败"><span>{error}</span></Alert>}
          <Button onClick={complete} loading={loading} disabled={!username || password.length < 8}>完成注册</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl" data-component="QuizRegister" data-od-id="register-quiz">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="default"><ListChecks className="w-3 h-3" /> 校内答题</Badge>
          <Badge variant="muted">{questions.length} 题</Badge>
        </div>
        <CardTitle className="mt-2">校内答题注册</CardTitle>
        <CardDescription>答对规定比例即可通过。限时 15 分钟，最多可答 5 次。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-[13px]">
          <div className="flex-1 h-1.5 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
            <div className="h-full bg-[var(--seed-primary)]" style={{ width: `${((questions.length - remaining) / questions.length) * 100}%` }} />
          </div>
          <span className="text-[var(--muted)] tabular-nums">{questions.length - remaining}/{questions.length}</span>
        </div>
        {questions.map((item, i) => (
          <div key={item.id ?? i} className="rounded-[var(--radius)] border border-border p-4">
            <div className="text-[13px] text-[var(--muted)] tracking-[0.06em] uppercase mb-1">第 {i + 1} 题</div>
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
        {error && <Alert variant="danger" title="验证失败"><span>{error}</span></Alert>}
        <Button onClick={verify} disabled={remaining > 0 || loading} loading={loading} className="self-end">
          提交验证 <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- 邮箱注册 ---------- */
function EmailRegister() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState(null);
  const [phase, setPhase] = useState("send"); // send → verify → register → done
  const [verificationToken, setVerificationToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/registration/challenges", { method: "email", email }, {
        mock: { challenge_id: "ch_email_demo" },
      });
      setChallengeId(data.challenge_id);
      setPhase("verify");
    } catch (err) {
      setError(err?.message || "验证码发送失败，请检查邮箱地址。");
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/registration/verify", { challenge_id: challengeId, code }, {
        mock: { verification_token: "vt_email_demo" },
      });
      if (data.verification_token) {
        setVerificationToken(data.verification_token);
        setPhase("register");
      }
    } catch (err) {
      setError(err?.message || "验证码不正确，请重新输入。");
    }
    setLoading(false);
  };

  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      await apiPost("/registration", { verification_token: verificationToken, username, password }, {
        mock: { id: "usr_new", username, nickname: username, role: "student", status: "active", registration_trust_level: "community_quiz" },
      });
      setPhase("done");
      setPassword("");
    } catch (err) {
      setError(err?.message || "注册失败，请更换用户名重试。");
    }
    setLoading(false);
  };

  if (phase === "done") {
    return (
      <Card className="w-full max-w-md" data-component="EmailRegister" data-od-id="register-email">
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <CheckCircle2 className="w-10 h-10 text-[var(--success)]" />
          <div className="text-base font-medium">注册成功</div>
          <div className="text-[13px] text-[var(--muted)]">现在可以用新账号登录了。</div>
          <Button onClick={() => navigate("/auth/login")}>前往登录</Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "register") {
    return (
      <Card className="w-full max-w-md" data-component="EmailRegister" data-od-id="register-email">
        <CardHeader>
          <Badge variant="default" className="self-start">邮箱已验证</Badge>
          <CardTitle className="mt-2">设置账号密码</CardTitle>
          <CardDescription>用户名 3–32 字符，密码 8–128 字符。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eu">用户名</Label>
            <Input id="eu" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–32 字符" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep">密码</Label>
            <Input id="ep" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8–128 字符" />
          </div>
          {error && <Alert variant="danger" title="注册失败"><span>{error}</span></Alert>}
          <Button onClick={complete} loading={loading} disabled={!username || password.length < 8}>完成注册</Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "verify") {
    return (
      <Card className="w-full max-w-md" data-component="EmailRegister" data-od-id="register-email">
        <CardHeader>
          <Badge variant="default" className="self-start"><Mail className="w-3 h-3" /> 验证邮箱</Badge>
          <CardTitle className="mt-2">输入验证码</CardTitle>
          <CardDescription>验证码已发送至 {email}，请查收邮件。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec">验证码</Label>
            <Input id="ec" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6 位数字" />
          </div>
          {error && <Alert variant="danger" title="验证失败"><span>{error}</span></Alert>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPhase("send"); setCode(""); }}>返回</Button>
            <Button onClick={verifyCode} loading={loading} disabled={!code}>验证</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // phase === "send"
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
        {error && <Alert variant="danger" title="发送失败"><span>{error}</span></Alert>}
        <Button onClick={sendCode} loading={loading} disabled={!email || !email.endsWith(".edu.cn")}>发送验证码</Button>
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
          {/* 品牌 logo */}
          <div className="flex items-center gap-2.5 mb-2">
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
