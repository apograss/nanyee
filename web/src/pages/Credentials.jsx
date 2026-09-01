// Canvas design runtime editable source marker: credentials
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { KeyRound, Plus, Trash2, Armchair, Users, GraduationCap, ShieldCheck, Eye, EyeOff, Ban, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Label, Badge, Alert, Dialog, Table, cn } from "@/components/ui.jsx";
import {
  createCredential, listCredentials, revokeCredential, revealCredential, deleteCredential, renewCredential,
  isCredentialUsable, CREDENTIAL_PURPOSES, CONFIRMATION_VERSIONS,
} from "@/lib/api.jsx";

// 延期时长：180 天，一键续期无需重新输入密码
const RENEW_TTL_SECONDS = 180 * 86400;

const PURPOSE_META = {
  school: { label: "学校统一认证", upstream: "school", icon: GraduationCap, secretHint: "学号 + 学校密码，评课与学习舱共用" },
  evaluation: { label: "自动评课", upstream: "academic", icon: GraduationCap, secretHint: "JSON：{\"account\":\"学号\",\"password\":\"学校密码\"}" },
  study_cabin: { label: "学习舱", upstream: "infospace", icon: Armchair, secretHint: "JSON：{\"account\":\"学号\",\"password\":\"学校密码\"}" },
  qun_checkin: { label: "群报数", upstream: "qun100", icon: Users, secretHint: "完整 Authorization Token，≥60 字符，不含空白或省略号" },
};

// 添加授权只暴露这两个：学校类服务统一走 school 凭据
const CREATE_OPTIONS = ["school", "qun_checkin"];

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
  const [purpose, setPurpose] = useState("school");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [hint, setHint] = useState("");
  const [ttl, setTtl] = useState(RENEW_TTL_SECONDS); // 默认 180 天
  const [loading, setLoading] = useState(false);
  const [revealFor, setRevealFor] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealError, setRevealError] = useState("");
  const [deleteFor, setDeleteFor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const meta = PURPOSE_META[purpose];
  const isSchoolAccount = purpose !== "qun_checkin";

  useEffect(() => {
    listCredentials().then(setList).catch(() => setList([]));
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
      });
      // 提交即清空
      setPassword(""); setToken(""); setAccount(""); setHint("");
      setCreateOpen(false);
      listCredentials().then(setList).catch(() => {});
    } catch {}
    setLoading(false);
  };

  const doRevoke = async (id) => {
    try {
      await revokeCredential(id);
      setList(list.map((c) => c.id === id ? { ...c, status: "revoked" } : c));
    } catch {}
  };

  const doRenew = async (id) => {
    try {
      await renewCredential(id, { ttl_seconds: RENEW_TTL_SECONDS });
      listCredentials().then(setList).catch(() => {});
    } catch {}
  };

  const openReveal = async (cred) => {
    setRevealFor(cred);
    setRevealData(null);
    setRevealVisible(false);
    setRevealError("");
    try {
      const result = await revealCredential(cred.id);
      let parsed = null;
      try { parsed = JSON.parse(result.secret); } catch { /* 非 JSON 的是 token 类凭据 */ }
      setRevealData(parsed && typeof parsed === "object"
        ? { account: parsed.account || "", password: parsed.password || "" }
        : { account: "", password: result.secret });
    } catch (err) {
      setRevealError(err?.message || "读取失败，请稍后重试。");
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    try {
      await deleteCredential(deleteFor.id);
      setList(list.filter((c) => c.id !== deleteFor.id));
      setDeleteFor(null);
    } catch {}
    setDeleting(false);
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
        <p className="text-[var(--muted)] text-sm prose-body">学校统一认证账号一次托管，自动评课、学习舱共用；群报数单独授权。你可以随时查看、取消或删除。</p>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Alert variant="info" title="安全说明">
          <span>凭据以 AES-256-GCM 信封加密保存；查看明文需本人登录态二次确认；删除会立即清除密文，不可恢复。</span>
        </Alert>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="kicker"><strong>Authorizations</strong> — 授权列表</div>
              <CardTitle className="mt-1">我的授权</CardTitle>
              <CardDescription>学校统一认证凭据一条即可覆盖评课与学习舱。</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> 添加授权</Button>
          </CardHeader>
          <CardContent>
            <Table
              head={["用途", "状态", "备注", "到期", ""]}
              rows={list.map((c) => [
                <Badge variant={c.purpose === "school" ? "default" : c.purpose === "study_cabin" ? "outline" : "muted"}>
                  {PURPOSE_META[c.purpose]?.label || c.purpose}
                </Badge>,
                c.status !== "active" ? <Badge variant="muted">已取消</Badge>
                  : isCredentialUsable(c) ? <Badge variant="success">有效</Badge>
                    : <Badge variant="warning">已过期</Badge>,
                <span className="text-[13px]">{c.metadata?.account_hint || "—"}</span>,
                <span className="text-[13px] text-[var(--muted)]">{new Date(c.expires_at).toLocaleDateString("zh-CN")}</span>,
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={c.status !== "active"} onClick={() => doRenew(c.id)} title="延长 180 天，无需重新输入密码"><RefreshCw className="w-3.5 h-3.5" /> 延期</Button>
                  <Button size="sm" variant="ghost" onClick={() => openReveal(c)}><Eye className="w-3.5 h-3.5" /> 查看</Button>
                  <Button size="sm" variant="ghost" disabled={c.status !== "active"} onClick={() => doRevoke(c.id)}><Ban className="w-3.5 h-3.5" /> 禁用</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteFor(c)}><Trash2 className="w-3.5 h-3.5" /> 删除</Button>
                </div>,
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
            <div className="grid grid-cols-2 gap-2">
              {CREATE_OPTIONS.map((key) => {
                const m = PURPOSE_META[key];
                return (
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
                    <div className="mt-1 text-[11px] text-[var(--muted)]">{m.secretHint}</div>
                  </button>
                );
              })}
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
            <Label>有效期（天）</Label>
            <Input type="number" min="1" max="365" value={Math.round(ttl / 86400)} onChange={(e) => setTtl(Math.min(365, Math.max(1, Number(e.target.value) || 1)) * 86400)} />
            <div className="text-[11px] text-[var(--muted)]">默认 30 天，最长 365 天</div>
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

      <Dialog
        open={!!revealFor}
        onClose={() => setRevealFor(null)}
        title="查看凭据"
        description={revealFor ? `${PURPOSE_META[revealFor.purpose]?.label || revealFor.purpose} · ${revealFor.metadata?.account_hint || "无备注"}` : ""}
        footer={<Button onClick={() => setRevealFor(null)}>关闭</Button>}
      >
        {revealError ? (
          <Alert variant="danger" title="读取失败"><span>{revealError}</span></Alert>
        ) : !revealData ? (
          <div className="text-[13px] text-[var(--muted)]">读取中…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {revealData.account && (
              <div className="flex flex-col gap-1.5">
                <Label>账号</Label>
                <div className="rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-mono">{revealData.account}</div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>{revealData.account ? "密码" : "凭证内容"}</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-mono break-all">
                  {revealVisible ? revealData.password : "••••••••••"}
                </div>
                <Button size="sm" variant="outline" onClick={() => setRevealVisible(!revealVisible)}>
                  {revealVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {revealVisible ? "隐藏" : "显示"}
                </Button>
              </div>
            </div>
            <Alert variant="warning" title="注意">
              <span>明文只显示在当前页面，关闭对话框后即清除；请勿在他人注视下展示。</span>
            </Alert>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        title="删除凭据"
        description="删除后密文立即清除，不可恢复；引用它的未完成任务会被取消。"
        footer={<><Button variant="ghost" onClick={() => setDeleteFor(null)}>取消</Button><Button onClick={doDelete} loading={deleting}><Trash2 className="w-4 h-4" /> 确认删除</Button></>}
      >
        {deleteFor && (
          <div className="text-[13px] flex flex-col gap-2">
            <div>确定删除「{PURPOSE_META[deleteFor.purpose]?.label || deleteFor.purpose}」（{deleteFor.metadata?.account_hint || "无备注"}）吗？</div>
            <div className="text-[var(--muted)]">如需保留凭据但暂停使用，可改用列表中的「禁用」。</div>
          </div>
        )}
      </Dialog>
    </motion.div>
  );
}
