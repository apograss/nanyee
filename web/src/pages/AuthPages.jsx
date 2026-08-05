// Canvas design runtime editable source marker: auth-pages
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Button, Input, Label, Alert, Badge, Spinner, cn } from "@/components/ui.jsx";
import { useTurnstile, useAuth, apiPost } from "@/lib/api.jsx";
import { ThemeToggle } from "@/lib/theme.jsx";

const EASE = [0.22, 1, 0.36, 1];

/* ---------- 编辑风表单面板 ---------- */
function AuthPanel({ kicker, title, description, children, wide = false, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE }}
      className={cn("w-full", wide ? "max-w-2xl" : "max-w-md")}
      {...props}
    >
      <div className="kicker"><strong>{kicker}</strong></div>
      <h1 className="display-lede mt-3">{title}</h1>
      {description && <p className="text-[13px] text-[var(--muted)] mt-2.5 leading-[1.65] max-w-[46ch]">{description}</p>}
      <div className="rule-line mt-5 mb-6" />
      {children}
    </motion.div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { replayWithChallenge, widget } = useTurnstile();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiPost("/auth/login", { username, password }, { action: "login" });
      await refresh();
      setPassword("");
      const from = location.state?.from || "/";
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === "RATE_LIMIT_CHALLENGE_REQUIRED" && err.turnstileChallenge) {
        // 触发 Turnstile 挑战：渲染 widget 取 token 后重放登录请求
        const { sitekey, action } = err.turnstileChallenge;
        try {
          await replayWithChallenge(
            (t) => apiPost("/auth/login", { username, password }, { turnstileToken: t, action: "login" }),
            action,
            sitekey
          );
          await refresh();
          setPassword("");
          const from = location.state?.from || "/";
          navigate(from, { replace: true });
        } catch (retryErr) {
          setError(retryErr?.code === "HUMAN_VERIFICATION_FAILED" ? "人机验证失败，请重试" : retryErr?.message || "登录失败，请检查用户名和密码。");
        }
      } else if (err.code === "HUMAN_VERIFICATION_FAILED") {
        setError("人机验证失败，请重试");
      } else {
        setError(err?.message || "登录失败，请检查用户名和密码。");
      }
    }
    setLoading(false);
  };

  return (
    <AuthPanel
      kicker="Sign In — 平台账号"
      title="登录南医工具台"
      description="登录信息由系统安全保存，密码仅用于本次登录。"
      data-component="LoginForm"
      data-od-id="login"
    >
      {location.state?.from && (
        <div className="mb-4">
          <Alert variant="info" title="需要平台账号">这个操作需要登录平台账号，登录后会自动回到之前的页面。</Alert>
        </div>
      )}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="u">用户名</Label>
          <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="学号或注册用户名" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p">密码</Label>
          <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="8–128 字符" />
        </div>
        <Button type="submit" loading={loading} className="w-full h-11 mt-1">登录</Button>
      </form>
      {widget && <div className="mt-4">{widget}</div>}
      {error && <div className="mt-4"><Alert variant="danger" title="登录失败"><span>{error}</span></Alert></div>}
      <div className="text-[13px] text-[var(--muted)] mt-6 flex items-center gap-2">
        没有账号？
        <Link to="/auth/register" className="inline-flex items-center gap-1 text-[var(--seed-primary-strong)] no-underline hover:underline underline-offset-4">
          注册一个 <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </AuthPanel>
  );
}

/* ---------- 答题注册 ---------- */
// 用户名规则（与后端一致）：2–24 字符，字母、数字或下划线
const USERNAME_PATTERN = /^[A-Za-z0-9_]{2,24}$/;

function QuizRegister() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [challengeId, setChallengeId] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [phase, setPhase] = useState("quiz"); // quiz → verifying → verified → register → done
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 拉取答题题目
  const fetchChallenges = useCallback(async () => {
    try {
      const data = await apiPost("/registration/challenges", { method: "quiz" }, { action: "registration_quiz" });
      setChallengeId(data.challenge_id);
      if (data.questions?.length) {
        setQuestions(data.questions);
        setAnswers(Array(data.questions.length).fill(null));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  const remaining = questions.length - answers.filter((a) => a !== null).length;
  const pick = (qi, opt) => setAnswers((prev) => { const n = [...prev]; n[qi] = opt; return n; });

  const verify = async () => {
    setLoading(true);
    setError("");
    try {
      // answers：按题目顺序的选项下标数组
      const data = await apiPost(`/registration/challenges/${challengeId}/verify`, { answers }, { action: "registration_quiz" });
      if (data.verified) {
        setPhase("register");
      }
    } catch (err) {
      let msg = err?.message || "答题验证失败，请重新作答。";
      if (err?.details?.score != null) {
        msg += `（得分 ${err.details.score} / 需 ${err.details.required_score}）`;
      }
      setError(msg);
    }
    setLoading(false);
  };

  const complete = async () => {
    setError("");
    if (!USERNAME_PATTERN.test(username)) {
      setError("用户名需为 2–24 个字符，仅限字母、数字或下划线。");
      return;
    }
    setLoading(true);
    try {
      // 注册成功即种会话 Cookie：刷新用户态后直接进首页
      await apiPost("/registration", { challenge_id: challengeId, username, password }, { action: "register" });
      await refresh();
      setPassword("");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "注册失败，请更换用户名重试。");
    }
    setLoading(false);
  };

  if (phase === "register") {
    return (
      <AuthPanel
        kicker="Step 02 — 设置账号"
        title="设置账号密码"
        description="用户名 2–24 字符（字母、数字或下划线），密码 8–128 字符。"
        data-component="QuizRegister"
        data-od-id="register-quiz"
      >
        <div className="flex flex-col gap-4">
          <Badge variant="success" className="self-start"><CheckCircle2 className="w-3 h-3" /> 答题已通过</Badge>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ru">用户名</Label>
            <Input id="ru" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="2–24 字符，字母、数字或下划线" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp">密码</Label>
            <Input id="rp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8–128 字符" />
          </div>
          {error && <Alert variant="danger" title="注册失败"><span>{error}</span></Alert>}
          <Button onClick={complete} loading={loading} disabled={!username || password.length < 8} className="h-11">完成注册</Button>
        </div>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      kicker="Step 01 — 校内答题"
      title="校内答题注册"
      description="答对规定比例即可通过。限时 15 分钟，最多可答 5 次。"
      wide
      data-component="QuizRegister"
      data-od-id="register-quiz"
    >
      {questions.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)] py-6"><Spinner /> 加载题目…</div>
      ) : (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-[13px]">
          <div className="flex-1 h-1 rounded-[var(--radius-full)] bg-[var(--seed-surface-2)] overflow-hidden">
            <motion.div
              className="h-full bg-[var(--seed-primary)]"
              initial={false}
              animate={{ width: `${((questions.length - remaining) / questions.length) * 100}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
          <span className="text-[var(--muted)] tabular-nums kicker">{questions.length - remaining}/{questions.length}</span>
        </div>
        {questions.map((item, i) => (
          <div key={item.id ?? i} className="rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5">
            <div className="kicker mb-1.5">第 {String(i + 1).padStart(2, "0")} 题</div>
            <div className="text-sm font-medium mb-3 tracking-[0.01em]">{item.question}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {item.options.map((opt, oi) => {
                const sel = answers[i] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => pick(i, oi)}
                    className={cn(
                      "text-left text-[13px] px-3 py-2.5 rounded-[var(--radius-sm)] border transition-colors",
                      sel ? "border-[var(--seed-primary)] bg-[var(--primary-muted)] text-[var(--seed-primary-strong)] font-medium" : "border-border hover:bg-[var(--seed-surface-2)]"
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
        <Button onClick={verify} disabled={remaining > 0 || loading} loading={loading} className="self-end h-11 mt-1">
          提交验证 <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
      )}
    </AuthPanel>
  );
}

/* ---------- 邮箱注册 ---------- */
function EmailRegister() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [phase, setPhase] = useState("send"); // send → verify → register → done
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/registration/challenges", { method: "email", email }, { action: "registration_email" });
      setChallengeId(data.challenge_id);
      setMaskedEmail(data.masked_email || "");
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
      const data = await apiPost(`/registration/challenges/${challengeId}/verify`, { code }, { action: "registration_email" });
      if (data.verified) {
        setPhase("register");
      }
    } catch (err) {
      setError(err?.message || "验证码不正确，请重新输入。");
    }
    setLoading(false);
  };

  const complete = async () => {
    setError("");
    if (!USERNAME_PATTERN.test(username)) {
      setError("用户名需为 2–24 个字符，仅限字母、数字或下划线。");
      return;
    }
    setLoading(true);
    try {
      // 注册成功即种会话 Cookie：刷新用户态后直接进首页
      await apiPost("/registration", { challenge_id: challengeId, username, password }, { action: "register" });
      await refresh();
      setPassword("");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.message || "注册失败，请更换用户名重试。");
    }
    setLoading(false);
  };

  if (phase === "register") {
    return (
      <AuthPanel
        kicker="Step 02 — 设置账号"
        title="设置账号密码"
        description="用户名 2–24 字符（字母、数字或下划线），密码 8–128 字符。"
        data-component="EmailRegister"
        data-od-id="register-email"
      >
        <div className="flex flex-col gap-4">
          <Badge variant="success" className="self-start"><CheckCircle2 className="w-3 h-3" /> 邮箱已验证</Badge>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eu">用户名</Label>
            <Input id="eu" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="2–24 字符，字母、数字或下划线" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ep">密码</Label>
            <Input id="ep" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8–128 字符" />
          </div>
          {error && <Alert variant="danger" title="注册失败"><span>{error}</span></Alert>}
          <Button onClick={complete} loading={loading} disabled={!username || password.length < 8} className="h-11">完成注册</Button>
        </div>
      </AuthPanel>
    );
  }

  if (phase === "verify") {
    return (
      <AuthPanel
        kicker="Step 01 — 验证邮箱"
        title="输入验证码"
        description={`验证码已发送至 ${maskedEmail || email}，请查收邮件。`}
        data-component="EmailRegister"
        data-od-id="register-email"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec">验证码</Label>
            <Input id="ec" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6 位数字" />
          </div>
          {error && <Alert variant="danger" title="验证失败"><span>{error}</span></Alert>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPhase("send"); setCode(""); }} className="h-11">返回</Button>
            <Button onClick={verifyCode} loading={loading} disabled={!code} className="h-11">验证</Button>
          </div>
        </div>
      </AuthPanel>
    );
  }

  // phase === "send"
  return (
    <AuthPanel
      kicker="Step 01 — 教育邮箱"
      title="教育邮箱注册"
      description="仅支持 .edu.cn 教育邮箱注册。"
      data-component="EmailRegister"
      data-od-id="register-email"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="em">教育邮箱</Label>
          <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@stu.smu.edu.cn" />
        </div>
        {error && <Alert variant="danger" title="发送失败"><span>{error}</span></Alert>}
        <Button onClick={sendCode} loading={loading} disabled={!email || !email.endsWith(".edu.cn")} className="h-11">
          发送验证码 <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </AuthPanel>
  );
}

/* ---------- 品牌侧栏：编辑叙事 ---------- */
function BrandAside() {
  return (
    <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-border overflow-hidden bg-[var(--seed-surface)]">
      <div className="grain-overlay" />
      {/* 顶部品牌 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="relative flex items-center gap-3"
      >
        <div className="w-9 h-9 rounded-[var(--radius)] bg-gradient-to-br from-[var(--seed-primary)] to-[color-mix(in_srgb,var(--seed-primary)_75%,var(--seed-warning))] text-[var(--primary-foreground)] flex items-center justify-center shadow-sm shrink-0">
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M12 8v4M10 10h4" />
          </svg>
        </div>
        <div className="font-display text-[16px] font-semibold tracking-[-0.02em]">南医工具台</div>
      </motion.div>

      {/* 中部叙事 */}
      <div className="relative max-w-[30rem]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="kicker"
        >
          <strong>Nanyee Toolkit</strong> — 学生工具平台
        </motion.div>
        <h1 className="display-hero mt-6">
          <span className="block overflow-hidden pb-1">
            <motion.span className="block" initial={{ y: "112%" }} animate={{ y: "0%" }} transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}>
              校园事务，
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-2">
            <motion.span className="block" initial={{ y: "112%" }} animate={{ y: "0%" }} transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}>
              <span className="text-[var(--seed-primary-strong)]">自动</span>完成。
            </motion.span>
          </span>
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.55 }}
          className="mt-6 text-[14px] text-[var(--muted)] leading-[1.75] max-w-[42ch]"
        >
          课表、成绩、选课、评课、学习舱预约与群报数打卡——
          登录一次，剩下的交给平台到点执行。
          <span className="accent-en ml-2">set it and forget it.</span>
        </motion.p>

        {/* 抽象编辑构图 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: EASE, delay: 0.7 }}
          className="relative mt-12 h-[120px]"
          aria-hidden="true"
        >
          <div className="absolute left-0 bottom-0 w-[120px] h-[60px] rounded-t-full border border-[color-mix(in_srgb,var(--seed-primary)_45%,transparent)] bg-gradient-to-b from-[color-mix(in_srgb,var(--seed-primary)_16%,transparent)] to-transparent" />
          <div className="absolute left-[150px] bottom-0 w-[46px] h-[46px] rounded-full border border-dashed border-[color-mix(in_srgb,var(--seed-muted)_45%,transparent)] animate-[spin_24s_linear_infinite]">
            <div className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[var(--seed-success)]" />
          </div>
          <div className="absolute left-[230px] bottom-[10px] w-2 h-2 rounded-full bg-[var(--seed-primary)] opacity-70" />
          <div className="absolute left-[260px] bottom-[26px] kicker">Fig. 02</div>
        </motion.div>
      </div>

      {/* 底部巨字 + 签条 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE, delay: 0.8 }}
        className="relative font-display font-bold text-[clamp(3.5rem,6.5vw,6.5rem)] leading-[0.85] tracking-[-0.04em] text-outline select-none whitespace-nowrap"
        aria-hidden="true"
      >
        NANYEE
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.9 }}
        className="relative flex items-center gap-4"
      >
        <span className="kicker">课表 · 成绩 · 选课 · 评课 · 学习舱 · 群报数</span>
        <span className="rule-line flex-1" />
      </motion.div>
    </aside>
  );
}

/* ---------- 下划线 Tabs ---------- */
function Tabs({ value, onValueChange, options }) {
  return (
    <div className="flex gap-7 border-b border-border w-full" data-component="Tabs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onValueChange(o.value)}
          className={cn(
            "relative pb-3 text-[14px] tracking-[0.01em] transition-colors",
            value === o.value ? "text-foreground font-medium" : "text-[var(--muted)] hover:text-foreground"
          )}
        >
          {o.label}
          {value === o.value && (
            <motion.span
              layoutId="auth-tab-underline"
              className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--seed-primary)]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export default function AuthPages({ mode }) {
  const [tab, setTab] = useState("quiz");
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]" data-component="AuthPages">
      <BrandAside />

      {/* 表单区 */}
      <div className="relative flex flex-col min-h-screen">
        <header className="flex items-center justify-between gap-3 px-5 sm:px-8 h-16 shrink-0">
          <Link to="/auth/login" className="flex lg:hidden items-center gap-2.5 no-underline">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-gradient-to-br from-[var(--seed-primary)] to-[color-mix(in_srgb,var(--seed-primary)_75%,var(--seed-warning))] text-[var(--primary-foreground)] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M12 8v4M10 10h4" />
              </svg>
            </div>
            <span className="font-display text-[15px] font-semibold">南医工具台</span>
          </Link>
          <span className="kicker hidden lg:block">{mode === "login" ? "Welcome back" : "Join us"}</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 flex items-start sm:items-center justify-center px-5 sm:px-8 py-8 sm:py-10">
          <div className="w-full max-w-2xl flex flex-col gap-7">
            {mode === "login" ? <LoginForm /> : (
              <>
                <Tabs value={tab} onValueChange={setTab} options={[
                  { value: "quiz", label: "校内答题" },
                  { value: "email", label: "教育邮箱" },
                ]} />
                {tab === "quiz" ? <QuizRegister /> : <EmailRegister />}
              </>
            )}
          </div>
        </main>

        <footer className="px-5 sm:px-8 pb-6 shrink-0">
          <div className="flex items-center gap-4">
            <span className="rule-line flex-1" />
            <span className="kicker">Nanyee — <span className="accent-en normal-case tracking-normal text-[12px]">made for students</span></span>
            <span className="rule-line flex-1" />
          </div>
        </footer>
      </div>
    </div>
  );
}
