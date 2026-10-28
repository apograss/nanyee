// Canvas design runtime editable source marker: account
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { UserCog, Mail, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Alert, Badge } from "@/components/ui.jsx";
import { useAuth, useTurnstile, startEmailBind, confirmEmailBind, unbindEmail } from "@/lib/api.jsx";

const EASE = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

// 请求被要求人机验证时，取 Turnstile token 后重放一次
function useChallengeRunner() {
  const { replayWithChallenge, widget } = useTurnstile();
  const run = async (fn) => {
    try {
      return await fn(undefined);
    } catch (err) {
      if (err.code === "RATE_LIMIT_CHALLENGE_REQUIRED" && err.turnstileChallenge) {
        const { action, sitekey } = err.turnstileChallenge;
        return replayWithChallenge((t) => fn(t), action, sitekey);
      }
      throw err;
    }
  };
  return { run, widget };
}

function EmailCard() {
  const { user, setUser } = useAuth();
  const bound = !!user?.email_verified;
  const { run, widget } = useChallengeRunner();
  // idle → (change | unbind) → code
  const [mode, setMode] = useState("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const reset = (next = "idle") => {
    setMode(next);
    setEmail("");
    setPassword("");
    setCode("");
    setChallenge(null);
    setError("");
  };

  const sendCode = async () => {
    setLoading(true);
    setError("");
    setDone("");
    try {
      const body = bound ? { email, password } : { email };
      const data = await run((t) => startEmailBind(body, { turnstileToken: t }));
      setChallenge(data);
      setPassword("");
      setMode("code");
    } catch (err) {
      setError(err?.message || "验证码发送失败，请稍后重试。");
    }
    setLoading(false);
  };

  const confirm = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await confirmEmailBind({ challenge_id: challenge.challenge_id, code });
      setUser(data.user);
      reset();
      setDone(bound ? "邮箱已换绑。" : "邮箱已绑定，忘记密码时可以用它找回。");
    } catch (err) {
      setError(err?.message || "验证码错误或已过期。");
    }
    setLoading(false);
  };

  const unbind = async () => {
    setLoading(true);
    setError("");
    setDone("");
    try {
      const data = await run((t) => unbindEmail({ password }, { turnstileToken: t }));
      setUser(data.user);
      reset();
      setDone("邮箱已解绑。");
    } catch (err) {
      setError(err?.message || "解绑失败，请稍后重试。");
    }
    setLoading(false);
  };

  return (
    <Card data-component="EmailCard">
      <CardHeader>
        <div className="kicker"><strong>Email</strong></div>
        <CardTitle className="flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--seed-primary-strong)]" /> 绑定邮箱</CardTitle>
        <CardDescription>忘记平台密码时，用绑定的邮箱收验证码找回。一个邮箱只能绑定一个账号，QQ 邮箱等都可以。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bound ? (
          <div className="flex items-center gap-3 text-[14px]">
            <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> 已绑定</Badge>
            <span className="font-medium break-all">{user.email}</span>
          </div>
        ) : (
          <Alert variant="warning" title="还没有绑定邮箱">
            <span>没有绑定邮箱的话，忘记密码就找不回这个账号，账号下的自动评课等任务也没法自己停掉。</span>
          </Alert>
        )}

        {mode === "code" && challenge && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] text-[var(--muted)]">验证码已发送至 {challenge.masked_email}，15 分钟内有效。</div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bind-code">验证码</Label>
              <Input id="bind-code" value={code} onChange={(e) => setCode(e.target.value.trim())} inputMode="numeric" placeholder="6 位数字" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => reset()}>取消</Button>
              <Button onClick={confirm} loading={loading} disabled={!/^\d{6}$/.test(code)}>确认</Button>
            </div>
          </div>
        )}

        {(mode === "change" || (!bound && mode === "idle")) && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bind-email">{bound ? "新邮箱" : "邮箱"}</Label>
              <Input id="bind-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例如 123456@qq.com" autoComplete="email" />
            </div>
            {bound && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bind-password">当前平台密码</Label>
                <Input id="bind-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            <div className="flex gap-2">
              {bound && <Button variant="outline" onClick={() => reset()}>取消</Button>}
              <Button onClick={sendCode} loading={loading} disabled={!email || (bound && !password)}>发送验证码</Button>
            </div>
          </div>
        )}

        {mode === "unbind" && (
          <div className="flex flex-col gap-3">
            <Alert variant="warning" title="解绑后无法找回密码">
              <span>解绑后就不能再用邮箱找回平台密码了。</span>
            </Alert>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unbind-password">当前平台密码</Label>
              <Input id="unbind-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => reset()}>取消</Button>
              <Button variant="danger" onClick={unbind} loading={loading} disabled={!password}>解绑</Button>
            </div>
          </div>
        )}

        {bound && mode === "idle" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => reset("change")}>换绑邮箱</Button>
            <Button variant="ghost" onClick={() => reset("unbind")}>解绑</Button>
          </div>
        )}

        {widget}
        {error && <Alert variant="danger" title="操作失败"><span>{error}</span></Alert>}
        {done && <Alert variant="success" title="完成"><span>{done}</span></Alert>}
      </CardContent>
    </Card>
  );
}

export default function Account() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const welcome = !!location.state?.welcome && !user?.email_verified;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto flex flex-col gap-8"
      data-component="AccountPage"
    >
      <motion.header variants={fadeUp} className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>Account</strong> — 账号设置</span>
          <span className="rule-line flex-1" />
          <UserCog className="w-4 h-4 text-[var(--seed-primary)]" />
        </div>
        <h1 className="display-lede">账号设置</h1>
        <p className="text-[var(--muted)] text-sm prose-body">
          平台账号 <strong>@{user?.username}</strong>。这是南医工具台自己的账号，和学校统一认证账号无关。
        </p>
      </motion.header>

      {welcome && (
        <motion.div variants={fadeUp}>
          <Alert variant="info" title="注册成功！建议先绑定邮箱">
            <span>
              绑定后忘记密码可以自己找回。也可以以后再在「账号设置」里绑定。
              <button type="button" className="ml-2 underline underline-offset-4" onClick={() => navigate("/", { replace: true })}>以后再说</button>
            </span>
          </Alert>
        </motion.div>
      )}

      <motion.div variants={fadeUp}>
        <EmailCard />
      </motion.div>
    </motion.div>
  );
}
