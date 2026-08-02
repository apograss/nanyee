// Canvas design runtime editable source marker: evaluations
import React, { useState } from "react";
import { motion } from "motion/react";
import { ClipboardCheck, Clock, AlertTriangle, ArrowRight, CheckCircle2, Zap, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, StatusBadge, cn } from "@/components/ui.jsx";
import {
  createCredential, createJob, CONFIRMATION_VERSIONS, CREDENTIAL_PURPOSES,
  mockJobs, useAuth,
} from "@/lib/api.jsx";

const EASE = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function Evaluations() {
  const { user } = useAuth();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [accountHint, setAccountHint] = useState("");
  const [maxCourses, setMaxCourses] = useState(60);
  const [retryUntil, setRetryUntil] = useState("");
  const [ttl, setTtl] = useState(2592000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { credential_id, job_id } | error

  const purpose = CREDENTIAL_PURPOSES.find((p) => p.purpose === "evaluation");

  const submit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const secret = JSON.stringify({ account, password });
      const cred = await createCredential({
        upstream: purpose.upstream,
        purpose: purpose.purpose,
        secret,
        consent_version: CONFIRMATION_VERSIONS.credentialHosting,
        ttl_seconds: ttl,
        metadata: { account_hint: accountHint || `尾号 ${account.slice(-4)}` },
      }, { mock: { id: "cred_eval_new", upstream: purpose.upstream, purpose: purpose.purpose, status: "active", expires_at: new Date(Date.now() + ttl * 1000).toISOString(), created_at: new Date().toISOString(), last_used_at: null, metadata: { account_hint: accountHint || `尾号 ${account.slice(-4)}` }, consent_version: CONFIRMATION_VERSIONS.credentialHosting } });

      const payload = { strategy: "legacy_positive_random", max_courses: maxCourses };
      if (retryUntil) payload.retry_until = retryUntil;

      const job = await createJob({
        tool_id: "evaluation",
        operation: "submit",
        credential_id: cred.id,
        confirmation_version: CONFIRMATION_VERSIONS.evaluationJob,
        payload,
      }, { mock: mockJobs[0] });

      setResult({ credential_id: cred.id, job_id: job.id, state: job.state });
      setPassword(""); // 提交即清空
    } catch (err) {
      setResult({ error: err?.message || "创建失败" });
    }
    setLoading(false);
  };

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="max-w-4xl mx-auto flex flex-col gap-8"
      data-component="EvaluationsPage"
      data-od-id="evaluations"
    >
      {/* ---------- 编辑风页头 ---------- */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>Evaluations</strong> — 托管自动评课</span>
          <span className="rule-line flex-1" />
          <ClipboardCheck className="w-4 h-4 text-[var(--seed-primary)]" />
        </div>
        <h1 className="display-lede">自动评课</h1>
        <p className="text-[var(--muted)] text-sm prose-body">提交后会在后台自动完成全部课程的评教，遇到验证码自动重试，关闭浏览器也不影响执行。</p>
      </motion.div>

      {/* ---------- 提示条 ---------- */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3">
        <Alert variant="info" title="后台自动执行">
          <span>任务在后台持续运行，关闭页面也不会中断。遇到验证码会自动重试。</span>
        </Alert>

        <Alert variant="warning" title="密码不保存">
          <span>学校密码只用于本次提交，提交后立即清空，不会保存或留痕。</span>
        </Alert>
      </motion.div>

      {/* ---------- Step 01 · 创建评课凭据 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker"><strong>Step 01</strong></div>
            <CardTitle>创建评课凭据</CardTitle>
            <CardDescription>
              用于自动评教的学校账号授权，到期前可重复使用。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>学号</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" />
              </div>
              <div>
                <Label>学校密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="提交后立即清空" />
              </div>
              <div>
                <Label>脱敏提示（可选）</Label>
                <Input value={accountHint} onChange={(e) => setAccountHint(e.target.value)} placeholder="尾号 0001" />
              </div>
              <div>
                <Label>凭据有效期（秒）</Label>
                <Input type="number" min="300" max="2592000" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
                <div className="text-[11px] text-[var(--muted)] mt-1">默认 30 天</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- Step 02 · 任务参数 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker"><strong>Step 02</strong></div>
            <CardTitle>任务参数</CardTitle>
            <CardDescription>自动查找全部待评课程并依次提交。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>评课策略</Label>
                <Input value="自动评课" disabled className="font-mono text-[13px]" />
                <div className="text-[11px] text-[var(--muted)] mt-1">系统自动生成正面评价</div>
              </div>
              <div>
                <Label>最大评课数</Label>
                <Input type="number" min="1" max="60" value={maxCourses} onChange={(e) => setMaxCourses(Number(e.target.value))} />
                <div className="text-[11px] text-[var(--muted)] mt-1">默认 60 门</div>
              </div>
              <div>
                <Label>截止时间（可选）</Label>
                <Input type="datetime-local" value={retryUntil} onChange={(e) => setRetryUntil(e.target.value)} />
                <div className="text-[11px] text-[var(--muted)] mt-1">到达后停止重试</div>
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-border p-4 bg-[var(--seed-surface-2)] text-[13px] flex flex-col gap-1.5">
              <div className="flex justify-between"><span className="text-[var(--muted)]">验证码识别</span><span>失败自动重试</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">浏览器关闭</span><span>不影响后续执行</span></div>
            </div>

            <div className="rule-line" />

            <Button onClick={submit} loading={loading} disabled={!account || !password}>
              <Zap className="w-4 h-4" /> 创建凭据并提交评课任务
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {result && !result.error && (
        <motion.div variants={fadeUp}>
          <Alert variant="success" title="评课任务已创建">
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                <span className="text-[13px]">学校账号授权已创建</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-[var(--success)]" />
                <StatusBadge status={result.state} />
                <span className="text-[13px]">任务已在后台开始执行</span>
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1">可在「任务」页面查看运行状态。学校密码已清空。</div>
            </div>
          </Alert>
        </motion.div>
      )}

      {result?.error && (
        <motion.div variants={fadeUp}>
          <Alert variant="danger" title="创建失败"><span className="text-[13px]">{result.error}</span></Alert>
        </motion.div>
      )}

      {/* ---------- 页脚签条 ---------- */}
      <motion.div variants={fadeUp} className="flex items-center gap-4 pb-2">
        <span className="rule-line flex-1" />
        <span className="text-[12px] text-[var(--muted)] whitespace-nowrap">
          如需手动逐题评教，可<a href="#" className="text-[var(--seed-primary-strong)] underline-offset-2 hover:underline">前往旧版入口</a>
        </span>
        <span className="rule-line flex-1" />
      </motion.div>
    </motion.div>
  );
}
