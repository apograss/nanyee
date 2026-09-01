// Canvas design runtime editable source marker: evaluations
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ClipboardCheck, ArrowRight, Zap, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Alert, StatusBadge } from "@/components/ui.jsx";
import {
  createCredential, createJob, listCredentials, renewCredential, isCredentialUsable,
  CONFIRMATION_VERSIONS, CREDENTIAL_PURPOSES, useAuth,
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

// 凭据长期保存：180 天，期间任务可重复使用该授权；到期可一键延期，也可随时在「我的凭据」删除
const CREDENTIAL_TTL_SECONDS = 180 * 24 * 60 * 60;

export default function Evaluations() {
  const { user } = useAuth();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [credential, setCredential] = useState(null);
  const [expiredCredential, setExpiredCredential] = useState(null);
  const [credLoading, setCredLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { credential_id, job_id, state } | { error }

  const purpose = CREDENTIAL_PURPOSES.find((p) => p.purpose === "school");

  const refreshCredentials = () => {
    if (!user) {
      setCredential(null);
      setExpiredCredential(null);
      setCredLoading(false);
      return;
    }
    // 已托管的学校统一认证（school）与旧版评课专用凭据都可用，优先统一认证；已过期的视为无效
    listCredentials()
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list?.items || []);
        const school = arr.find((c) => c.purpose === "school" && isCredentialUsable(c));
        const legacy = arr.find((c) => c.purpose === "evaluation" && isCredentialUsable(c));
        setCredential(school || legacy || null);
        setExpiredCredential(
          arr.find(
            (c) =>
              (c.purpose === "school" || c.purpose === "evaluation") &&
              c.status === "active" &&
              !isCredentialUsable(c),
          ) || null,
        );
      })
      .catch(() => setCredential(null))
      .finally(() => setCredLoading(false));
  };

  useEffect(refreshCredentials, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 过期凭据可直接延期，无需重新输入学校密码
  const renewExpired = async () => {
    if (!expiredCredential) return;
    try {
      await renewCredential(expiredCredential.id, { ttl_seconds: CREDENTIAL_TTL_SECONDS });
      setExpiredCredential(null);
      setCredLoading(true);
      refreshCredentials();
    } catch (err) {
      setResult({ error: err?.message || "延期失败" });
    }
  };

  const submit = async () => {
    setLoading(true);
    setResult(null);
    try {
      let cred = credential;
      if (!cred) {
        const secret = JSON.stringify({ account, password });
        cred = await createCredential({
          upstream: purpose.upstream,
          purpose: purpose.purpose,
          secret,
          consent_version: CONFIRMATION_VERSIONS.credentialHosting,
          ttl_seconds: CREDENTIAL_TTL_SECONDS,
          metadata: { account_hint: `尾号 ${account.slice(-4)}` },
        });
        setCredential(cred);
      }

      const job = await createJob({
        tool_id: "evaluation",
        operation: "submit",
        credential_id: cred.id,
        confirmation_version: CONFIRMATION_VERSIONS.evaluationJob,
        payload: { strategy: "legacy_positive_random", max_courses: 60 },
      });

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
      <motion.div variants={fadeUp}>
        <Alert variant="info" title="后台自动执行">
          <span>任务在后台持续运行，自动查找全部待评课程并依次提交。遇到验证码会自动识别重试，关闭页面也不会中断。</span>
        </Alert>
      </motion.div>

      {/* ---------- 学校账号授权 ---------- */}
      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader>
            <div className="kicker"><strong>School Account</strong></div>
            <CardTitle>学校账号授权</CardTitle>
            <CardDescription>
              授权后后台自动完成全部评课：立即先评一次，之后每天北京时间 07:00 自动执行，直到你取消。凭据以 AES-256-GCM 信封加密保存 180 天，到期可一键延期，也可随时在「我的凭据」中删除。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {credential ? (
              <Alert variant="success" title="已托管学校统一认证凭据">
                <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
                  {credential.metadata?.account_hint && <span>（{credential.metadata.account_hint}）</span>}
                  {credential.expires_at && <span className="opacity-70">· 有效期至 {new Date(credential.expires_at).toLocaleDateString("zh-CN")}</span>}
                  <span className="opacity-70">· 可在「授权管理」中查看、禁用或删除</span>
                </span>
              </Alert>
            ) : (
              <>
                {expiredCredential && (
                  <Alert variant="warning" title="原凭据已过期">
                    <span className="text-[13px]">
                      有效期至 {new Date(expiredCredential.expires_at).toLocaleDateString("zh-CN")}，可一键延期（无需重新输入密码），或重新输入学号密码授权。
                    </span>
                    <Button size="sm" variant="outline" className="mt-2" onClick={renewExpired}>
                      <Zap className="w-3.5 h-3.5" /> 延期 180 天
                    </Button>
                  </Alert>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>学号</Label>
                    <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" />
                  </div>
                  <div>
                    <Label>学校密码</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="提交后立即清空" />
                  </div>
                </div>
              </>
            )}

            <div className="rounded-[var(--radius)] border border-border p-4 bg-[var(--seed-surface-2)] text-[13px] flex flex-col gap-1.5">
              <div className="flex justify-between"><span className="text-[var(--muted)]">评课方式</span><span>自动查找待评课程，生成正面评价</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">运行频率</span><span>每天 07:00（北京时间）自动执行</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">验证码</span><span>识别失败自动重试</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">授权有效期</span><span>180 天，到期可延期，可随时删除</span></div>
            </div>

            <Button onClick={submit} loading={loading} disabled={credLoading || (!credential && (!account || !password))} className="self-start">
              <Zap className="w-4 h-4" /> 开始自动评课
            </Button>

            {result?.error && (
              <Alert variant="danger" title="创建失败"><span className="text-[13px]">{result.error}</span></Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {result && !result.error && (
        <motion.div variants={fadeUp}>
          <Alert variant="success" title="评课任务已创建">
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                <span className="text-[13px]">学校账号授权就绪</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-[var(--success)]" />
                <StatusBadge status={result.state} />
                <span className="text-[13px]">任务已在后台开始执行，之后每天 07:00（北京时间）自动运行</span>
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1">可在「任务」页面查看运行状态。学校密码已清空。</div>
            </div>
          </Alert>
        </motion.div>
      )}
    </motion.div>
  );
}
