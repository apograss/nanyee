// Canvas design runtime editable source marker: credentials
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { KeyRound, Plus, Trash2, Armchair, Users, GraduationCap, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, Dialog, Table, cn } from "@/components/ui.jsx";
import {
  createCredential, listCredentials, revokeCredential,
  CREDENTIAL_PURPOSES, CONFIRMATION_VERSIONS, mockCredentials,
} from "@/lib/api.jsx";

const PURPOSE_META = {
  evaluation: { label: "自动评课", upstream: "academic", icon: GraduationCap, secretHint: "JSON：{\"account\":\"学号\",\"password\":\"学校密码\"}" },
  study_cabin: { label: "学习舱", upstream: "infospace", icon: Armchair, secretHint: "JSON：{\"account\":\"学号\",\"password\":\"学校密码\"}" },
  qun_checkin: { label: "群报数", upstream: "qun100", icon: Users, secretHint: "完整 Authorization Token，≥60 字符，不含空白或省略号" },
};

const EASE = [0.22, 1, 0.36, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export default function Credentials() {
  const [list, setList] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [purpose, setPurpose] = useState("evaluation");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [hint, setHint] = useState("");
  const [ttl, setTtl] = useState(2592000);
  const [loading, setLoading] = useState(false);
  const meta = PURPOSE_META[purpose];
  const isSchoolAccount = purpose === "evaluation" || purpose === "study_cabin";

  useEffect(() => {
    listCredentials({ mock: mockCredentials }).then(setList).catch(() => setList(mockCredentials));
  }, []);

  const create = async () => {
    setLoading(true);
    try {
      const secret = isSchoolAccount
        ? JSON.stringify({ account, password })
        : token;
      await createCredential({
        upstream: meta.upstream,
        purpose,
        secret,
        consent_version: CONFIRMATION_VERSIONS.credentialHosting,
        ttl_seconds: ttl,
        metadata: { account_hint: hint || (isSchoolAccount ? `尾号 ${account.slice(-4)}` : `尾号 ${token.slice(-4)}`) },
      }, { mock: { id: `cred_new_${Date.now()}`, upstream: meta.upstream, purpose, status: "active", expires_at: new Date(Date.now() + ttl * 1000).toISOString(), created_at: new Date().toISOString(), last_used_at: null, metadata: { account_hint: hint || `尾号 ${isSchoolAccount ? account.slice(-4) : token.slice(-4)}` }, consent_version: CONFIRMATION_VERSIONS.credentialHosting } });
      // 提交即清空
      setPassword(""); setToken(""); setAccount(""); setHint("");
      setCreateOpen(false);
      listCredentials({ mock: mockCredentials }).then(setList).catch(() => {});
    } catch {}
    setLoading(false);
  };

  const doRevoke = async (id) => {
    try {
      await revokeCredential(id, { mock: { id, status: "revoked" } });
      setList(list.map((c) => c.id === id ? { ...c, status: "revoked" } : c));
    } catch {}
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto flex flex-col gap-6"
      data-component="CredentialsPage"
      data-od-id="credentials"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ---------- 编辑风页头 ---------- */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3 pt-2">
        <div className="flex items-center gap-4">
          <span className="kicker"><strong>Credentials</strong> — 我的授权</span>
          <span className="rule-line flex-1" />
          <ShieldCheck className="w-4 h-4 text-[var(--seed-primary)]" />
        </div>
        <h1 className="display-lede">授权管理</h1>
        <p className="text-[var(--muted)] text-sm prose-body">用于自动评课、学习舱和群报数等需要登录的功能。你可以随时添加或取消授权。</p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Alert variant="info" title="安全说明">
          <span>密码经过加密保存，列表只显示用途、状态和有效期。你的密码不会明文保存。</span>
        </Alert>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="kicker"><strong>Authorizations</strong> — 授权列表</div>
              <CardTitle className="mt-1">我的授权</CardTitle>
              <CardDescription>每个用途对应一个授权。</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> 添加授权</Button>
          </CardHeader>
          <CardContent>
            <Table
              head={["用途", "状态", "备注", "到期", ""]}
              rows={list.map((c) => [
                <Badge variant={c.purpose === "evaluation" ? "default" : c.purpose === "study_cabin" ? "outline" : "muted"}>
                  {PURPOSE_META[c.purpose]?.label || c.purpose}
                </Badge>,
                c.status === "active" ? <Badge variant="success">有效</Badge> : <Badge variant="muted">已取消</Badge>,
                <span className="text-[13px]">{c.metadata?.account_hint || "—"}</span>,
                <span className="text-[13px] text-[var(--muted)]">{new Date(c.expires_at).toLocaleDateString("zh-CN")}</span>,
                <Button size="sm" variant="ghost" disabled={c.status !== "active"} onClick={() => doRevoke(c.id)}><Trash2 className="w-3.5 h-3.5" /> 取消授权</Button>,
              ])}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- 页脚签条 ---------- */}
      <motion.div variants={fadeUp} className="flex items-center gap-4 pb-2">
        <span className="rule-line flex-1" />
        <span className="kicker inline-flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 text-[var(--seed-primary)]" />
          Nanyee — <span className="accent-en normal-case tracking-normal text-[13px]">hosted secrets, sealed tight</span>
        </span>
        <span className="rule-line flex-1" />
      </motion.div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="添加授权"
        description="填写后点击确认，密码将不会被保存。"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button><Button onClick={create} loading={loading}>确认添加</Button></>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>用途</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PURPOSE_META).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setPurpose(key)}
                  className={cn("text-left p-3 rounded-[var(--radius-sm)] border text-[13px] transition-colors", purpose === key ? "border-[var(--seed-primary)] bg-[var(--primary-muted)]" : "border-border hover:bg-[var(--seed-surface-2)]")}
                  data-component="PurposeToggle"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <m.icon className="w-3.5 h-3.5 text-[var(--seed-primary-strong)]" />
                    {m.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isSchoolAccount ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>学号</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="20260001" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>学校密码</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="仅本次提交使用，不保存" />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>群报数登录凭证</Label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="请粘贴完整的登录凭证" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>有效期</Label>
            <Input type="number" min="300" max="2592000" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
            <div className="text-[11px] text-[var(--muted)]">默认 30 天</div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>备注（仅自己可见）</Label>
            <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="如：尾号 0001 或 群号 3***2" />
          </div>

          <Alert variant="warning" title="密码不保存">
            <span>添加成功后输入框会立即清空，密码不会被保存到本地。</span>
          </Alert>
        </div>
      </Dialog>
    </motion.div>
  );
}
