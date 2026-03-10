"use client";

import { useState, useEffect } from "react";
import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";
import styles from "../settings.module.css";
import sec from "./security.module.css";

interface ProfileBasic {
  email: string | null;
  emailVerifiedAt: string | null;
}

type EmailStep = "idle" | "form" | "code-sent" | "confirm-codes";

export default function SecuritySettingsPage() {
  const [profile, setProfile] = useState<ProfileBasic | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change
  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Email bind/change
  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [requestId, setRequestId] = useState("");
  const [emailCode, setEmailCode] = useState("");      // for bind (single code)
  const [oldEmailCode, setOldEmailCode] = useState(""); // for change
  const [newEmailCode, setNewEmailCode] = useState(""); // for change
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/profile");
        const data = await res.json();
        if (data.ok) {
          setProfile({ email: data.data.email, emailVerifiedAt: data.data.emailVerifiedAt });
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  // Password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: "两次输入的密码不一致" });
      return;
    }
    if (newPwd.length < 6) {
      setPwdMsg({ ok: false, text: "新密码至少 6 个字符" });
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: oldPwd,
          newPassword: newPwd,
          revokeOtherSessions: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const revokedText = data.data.revokedCount > 0
          ? `，已注销其他 ${data.data.revokedCount} 个设备`
          : "";
        setPwdMsg({ ok: true, text: `密码修改成功${revokedText}` });
        setOldPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setShowPwd(false);
      } else {
        setPwdMsg({ ok: false, text: data.error?.message || "修改失败" });
      }
    } catch {
      setPwdMsg({ ok: false, text: "网络错误" });
    }
    setPwdSaving(false);
  };

  // Email bind/change request
  const handleEmailRequest = async () => {
    setEmailMsg(null);
    if (!emailPassword || !newEmail) {
      setEmailMsg({ ok: false, text: "请填写完整信息" });
      return;
    }
    setEmailSaving(true);
    try {
      const isChange = !!profile?.email;
      const url = isChange
        ? "/api/auth/email/change/request"
        : "/api/auth/email/bind/request";
      const body = isChange
        ? { newEmail, currentPassword: emailPassword }
        : { email: newEmail, currentPassword: emailPassword };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setRequestId(data.data.requestId);
        setEmailStep(isChange ? "confirm-codes" : "code-sent");
        startResendTimer();
        setEmailMsg({ ok: true, text: "验证码已发送，请查收邮箱" });
      } else {
        setEmailMsg({ ok: false, text: data.error?.message || "请求失败" });
      }
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  // Email bind confirm (single code)
  const handleBindConfirm = async () => {
    setEmailMsg(null);
    if (emailCode.length !== 6) {
      setEmailMsg({ ok: false, text: "请输入 6 位验证码" });
      return;
    }
    setEmailSaving(true);
    try {
      const res = await fetch("/api/auth/email/bind/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, code: emailCode }),
      });
      const data = await res.json();
      if (data.ok) {
        setProfile({ email: data.data.email, emailVerifiedAt: data.data.emailVerifiedAt });
        setEmailStep("idle");
        setNewEmail("");
        setEmailPassword("");
        setEmailCode("");
        setEmailMsg({ ok: true, text: "邮箱绑定成功" });
      } else {
        setEmailMsg({ ok: false, text: data.error?.message || "验证失败" });
      }
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  // Email change confirm (dual codes)
  const handleChangeConfirm = async () => {
    setEmailMsg(null);
    if (oldEmailCode.length !== 6 || newEmailCode.length !== 6) {
      setEmailMsg({ ok: false, text: "请输入两个 6 位验证码" });
      return;
    }
    setEmailSaving(true);
    try {
      const res = await fetch("/api/auth/email/change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          oldCode: oldEmailCode,
          newCode: newEmailCode,
          revokeOtherSessions: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setProfile({ email: data.data.email, emailVerifiedAt: data.data.emailVerifiedAt });
        setEmailStep("idle");
        setNewEmail("");
        setEmailPassword("");
        setOldEmailCode("");
        setNewEmailCode("");
        setEmailMsg({ ok: true, text: "邮箱更换成功" });
      } else {
        setEmailMsg({ ok: false, text: data.error?.message || "验证失败" });
      }
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  const resetEmailFlow = () => {
    setEmailStep("idle");
    setNewEmail("");
    setEmailPassword("");
    setEmailCode("");
    setOldEmailCode("");
    setNewEmailCode("");
    setRequestId("");
    setEmailMsg(null);
  };

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--text-muted)" }}>
        加载中...
      </div>
    );

  const hasEmail = !!profile?.email;

  return (
    <>
      {/* Password section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>修改密码</h2>
        {pwdMsg && (
          <div className={`${styles.msg} ${pwdMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {pwdMsg.text}
          </div>
        )}
        {showPwd ? (
          <form className={sec.pwdForm} onSubmit={handlePasswordChange}>
            <NeoInput
              label="当前密码"
              type="password"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              autoComplete="current-password"
              required
            />
            <NeoInput
              label="新密码"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              placeholder="至少 6 个字符"
              required
            />
            <NeoInput
              label="确认新密码"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className={sec.actionRow}>
              <NeoButton type="submit" variant="primary" size="sm" isLoading={pwdSaving}>
                确认修改
              </NeoButton>
              <NeoButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowPwd(false);
                  setOldPwd("");
                  setNewPwd("");
                  setConfirmPwd("");
                  setPwdMsg(null);
                }}
              >
                取消
              </NeoButton>
            </div>
          </form>
        ) : (
          <button className={sec.toggleBtn} onClick={() => setShowPwd(true)}>
            修改密码
          </button>
        )}
      </div>

      {/* Email section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {hasEmail ? "更换邮箱" : "绑定邮箱"}
        </h2>

        {hasEmail && (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>当前邮箱</span>
            <span className={styles.fieldValue}>
              {profile!.email}
              <span className={profile!.emailVerifiedAt ? styles.badgeOk : styles.badgeWarn}>
                {profile!.emailVerifiedAt ? "已验证" : "未验证"}
              </span>
            </span>
          </div>
        )}

        {emailMsg && (
          <div className={`${styles.msg} ${emailMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {emailMsg.text}
          </div>
        )}

        {emailStep === "idle" && (
          <button
            className={sec.toggleBtn}
            onClick={() => setEmailStep("form")}
          >
            {hasEmail ? "更换邮箱" : "绑定邮箱"}
          </button>
        )}

        {emailStep === "form" && (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              {hasEmail
                ? "更换邮箱需要验证当前邮箱和新邮箱。"
                : "绑定邮箱后可以使用邮箱找回密码。"}
            </p>
            <NeoInput
              label="当前密码"
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <NeoInput
              label="新邮箱地址"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <div className={sec.actionRow}>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={handleEmailRequest}
                isLoading={emailSaving}
                disabled={!emailPassword || !newEmail}
              >
                发送验证码
              </NeoButton>
              <NeoButton variant="secondary" size="sm" onClick={resetEmailFlow}>
                取消
              </NeoButton>
            </div>
          </div>
        )}

        {/* Bind: single code */}
        {emailStep === "code-sent" && (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              验证码已发送至 <strong>{newEmail}</strong>
            </p>
            <div className={sec.codeRow}>
              <NeoInput
                label="验证码"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                maxLength={6}
                placeholder="6 位数字"
                autoComplete="one-time-code"
              />
            </div>
            <button
              className={sec.resendBtn}
              disabled={resendTimer > 0}
              onClick={handleEmailRequest}
            >
              {resendTimer > 0 ? `${resendTimer}s 后可重发` : "重新发送"}
            </button>
            <div className={sec.actionRow}>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={handleBindConfirm}
                isLoading={emailSaving}
                disabled={emailCode.length !== 6}
              >
                确认绑定
              </NeoButton>
              <NeoButton variant="secondary" size="sm" onClick={resetEmailFlow}>
                取消
              </NeoButton>
            </div>
          </div>
        )}

        {/* Change: dual codes */}
        {emailStep === "confirm-codes" && (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              验证码已分别发送至旧邮箱和新邮箱 <strong>{newEmail}</strong>，请分别输入。
            </p>
            <NeoInput
              label="旧邮箱验证码"
              value={oldEmailCode}
              onChange={(e) => setOldEmailCode(e.target.value)}
              maxLength={6}
              placeholder="6 位数字"
              autoComplete="one-time-code"
            />
            <NeoInput
              label="新邮箱验证码"
              value={newEmailCode}
              onChange={(e) => setNewEmailCode(e.target.value)}
              maxLength={6}
              placeholder="6 位数字"
              autoComplete="one-time-code"
            />
            <button
              className={sec.resendBtn}
              disabled={resendTimer > 0}
              onClick={handleEmailRequest}
            >
              {resendTimer > 0 ? `${resendTimer}s 后可重发` : "重新发送"}
            </button>
            <div className={sec.actionRow}>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={handleChangeConfirm}
                isLoading={emailSaving}
                disabled={oldEmailCode.length !== 6 || newEmailCode.length !== 6}
              >
                确认更换
              </NeoButton>
              <NeoButton variant="secondary" size="sm" onClick={resetEmailFlow}>
                取消
              </NeoButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
