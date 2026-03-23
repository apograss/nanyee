"use client";

import { useEffect, useState } from "react";

import NeoButton from "@/components/atoms/NeoButton";
import NeoInput from "@/components/atoms/NeoInput";

import styles from "../settings.module.css";
import sec from "./security.module.css";

interface ProfileBasic {
  email: string | null;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
}

type EmailStep = "idle" | "form" | "code-sent" | "confirm-codes";

export default function SecuritySettingsPage() {
  const [profile, setProfile] = useState<ProfileBasic | null>(null);
  const [loading, setLoading] = useState(true);

  const [showPwd, setShowPwd] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [emailStep, setEmailStep] = useState<EmailStep>("idle");
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [requestId, setRequestId] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [oldEmailCode, setOldEmailCode] = useState("");
  const [newEmailCode, setNewEmailCode] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorMsg, setTwoFactorMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [setupData, setSetupData] = useState<{
    qrCodeDataUrl: string;
    manualEntryKey: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/auth/profile");
        const data = await response.json();
        if (data.ok) {
          setProfile({
            email: data.data.email,
            emailVerifiedAt: data.data.emailVerifiedAt,
            twoFactorEnabled: Boolean(data.data.twoFactorEnabled),
          });
        }
      } catch {
        // Keep the empty state and let the layout-level auth handling redirect if needed.
      }
      setLoading(false);
    })();
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((remaining) => {
        if (remaining <= 1) {
          clearInterval(interval);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
  };

  const refreshProfile = async () => {
    const response = await fetch("/api/auth/profile");
    const data = await response.json();
    if (data.ok) {
      setProfile({
        email: data.data.email,
        emailVerifiedAt: data.data.emailVerifiedAt,
        twoFactorEnabled: Boolean(data.data.twoFactorEnabled),
      });
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPwdMsg(null);

    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    if (newPwd.length < 6) {
      setPwdMsg({ ok: false, text: "新密码至少 6 位" });
      return;
    }

    setPwdSaving(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: oldPwd,
          newPassword: newPwd,
          revokeOtherSessions: true,
        }),
      });
      const data = await response.json();

      if (data.ok) {
        const revokedText = data.data.revokedCount > 0
          ? `，并已注销其他 ${data.data.revokedCount} 个设备`
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

  const handleEmailRequest = async () => {
    setEmailMsg(null);
    if (!emailPassword || !newEmail) {
      setEmailMsg({ ok: false, text: "请填写完整信息" });
      return;
    }

    setEmailSaving(true);
    try {
      const hasEmail = Boolean(profile?.email);
      const url = hasEmail
        ? "/api/auth/email/change/request"
        : "/api/auth/email/bind/request";
      const body = hasEmail
        ? { newEmail, currentPassword: emailPassword }
        : { email: newEmail, currentPassword: emailPassword };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.ok) {
        setEmailMsg({ ok: false, text: data.error?.message || "请求失败" });
        return;
      }

      setRequestId(data.data.requestId);
      setEmailStep(hasEmail ? "confirm-codes" : "code-sent");
      startResendTimer();
      setEmailMsg({ ok: true, text: "验证码已发送，请查收邮箱" });
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  const handleBindConfirm = async () => {
    setEmailMsg(null);
    if (emailCode.length !== 6) {
      setEmailMsg({ ok: false, text: "请输入 6 位验证码" });
      return;
    }

    setEmailSaving(true);
    try {
      const response = await fetch("/api/auth/email/bind/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, code: emailCode }),
      });
      const data = await response.json();

      if (!data.ok) {
        setEmailMsg({ ok: false, text: data.error?.message || "验证失败" });
        return;
      }

      setProfile((prev) => prev ? {
        ...prev,
        email: data.data.email,
        emailVerifiedAt: data.data.emailVerifiedAt,
      } : prev);
      setEmailStep("idle");
      setEmailPassword("");
      setNewEmail("");
      setEmailCode("");
      setEmailMsg({ ok: true, text: "邮箱绑定成功" });
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  const handleChangeConfirm = async () => {
    setEmailMsg(null);
    if (oldEmailCode.length !== 6 || newEmailCode.length !== 6) {
      setEmailMsg({ ok: false, text: "请输入两组 6 位验证码" });
      return;
    }

    setEmailSaving(true);
    try {
      const response = await fetch("/api/auth/email/change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          oldCode: oldEmailCode,
          newCode: newEmailCode,
          revokeOtherSessions: true,
        }),
      });
      const data = await response.json();

      if (!data.ok) {
        setEmailMsg({ ok: false, text: data.error?.message || "验证失败" });
        return;
      }

      setProfile((prev) => prev ? {
        ...prev,
        email: data.data.email,
        emailVerifiedAt: data.data.emailVerifiedAt,
      } : prev);
      setEmailStep("idle");
      setEmailPassword("");
      setNewEmail("");
      setOldEmailCode("");
      setNewEmailCode("");
      setEmailMsg({ ok: true, text: "邮箱更换成功" });
    } catch {
      setEmailMsg({ ok: false, text: "网络错误" });
    }
    setEmailSaving(false);
  };

  const resetEmailFlow = () => {
    setEmailStep("idle");
    setEmailPassword("");
    setNewEmail("");
    setRequestId("");
    setEmailCode("");
    setOldEmailCode("");
    setNewEmailCode("");
    setEmailMsg(null);
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorMsg(null);
    setTwoFactorBusy(true);
    try {
      const response = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        setTwoFactorMsg({ ok: false, text: data.error?.message || "2FA 初始化失败" });
        return;
      }
      setSetupData({
        qrCodeDataUrl: data.data.qrCodeDataUrl,
        manualEntryKey: data.data.manualEntryKey,
      });
      setRecoveryCodes([]);
    } catch {
      setTwoFactorMsg({ ok: false, text: "网络错误" });
    }
    setTwoFactorBusy(false);
  };

  const handleEnableTwoFactor = async () => {
    if (!twoFactorCode.trim()) {
      setTwoFactorMsg({ ok: false, text: "请输入 6 位验证码" });
      return;
    }

    setTwoFactorMsg(null);
    setTwoFactorBusy(true);
    try {
      const response = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFactorCode.trim() }),
      });
      const data = await response.json();
      if (!data.ok) {
        setTwoFactorMsg({ ok: false, text: data.error?.message || "2FA 启用失败" });
        return;
      }

      setRecoveryCodes(data.data.recoveryCodes || []);
      setTwoFactorCode("");
      setSetupData(null);
      setTwoFactorPassword("");
      setTwoFactorMsg({ ok: true, text: "2FA 已启用，请妥善保存恢复码" });
      await refreshProfile();
    } catch {
      setTwoFactorMsg({ ok: false, text: "网络错误" });
    }
    setTwoFactorBusy(false);
  };

  const handleDisableTwoFactor = async () => {
    if (!twoFactorPassword || !twoFactorCode) {
      setTwoFactorMsg({ ok: false, text: "请输入当前密码和验证码" });
      return;
    }

    setTwoFactorMsg(null);
    setTwoFactorBusy(true);
    try {
      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: twoFactorPassword,
          code: twoFactorCode,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setTwoFactorMsg({ ok: false, text: data.error?.message || "关闭 2FA 失败" });
        return;
      }

      setTwoFactorPassword("");
      setTwoFactorCode("");
      setRecoveryCodes([]);
      setSetupData(null);
      setTwoFactorMsg({ ok: true, text: "2FA 已关闭" });
      await refreshProfile();
    } catch {
      setTwoFactorMsg({ ok: false, text: "网络错误" });
    }
    setTwoFactorBusy(false);
  };

  const handleRegenerateRecoveryCodes = async () => {
    if (!twoFactorPassword || !twoFactorCode) {
      setTwoFactorMsg({ ok: false, text: "请输入当前密码和验证码" });
      return;
    }

    setTwoFactorMsg(null);
    setTwoFactorBusy(true);
    try {
      const response = await fetch("/api/auth/2fa/recovery/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: twoFactorPassword,
          code: twoFactorCode,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        setTwoFactorMsg({ ok: false, text: data.error?.message || "恢复码更新失败" });
        return;
      }

      setRecoveryCodes(data.data.recoveryCodes || []);
      setTwoFactorPassword("");
      setTwoFactorCode("");
      setTwoFactorMsg({ ok: true, text: "新的恢复码已生成，请立即保存" });
    } catch {
      setTwoFactorMsg({ ok: false, text: "网络错误" });
    }
    setTwoFactorBusy(false);
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--text-muted)" }}>
        加载中...
      </div>
    );
  }

  const hasEmail = Boolean(profile?.email);

  return (
    <>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>修改密码</h2>
        {pwdMsg ? (
          <div className={`${styles.msg} ${pwdMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {pwdMsg.text}
          </div>
        ) : null}

        {showPwd ? (
          <form className={sec.pwdForm} onSubmit={handlePasswordChange}>
            <NeoInput
              label="当前密码"
              type="password"
              value={oldPwd}
              onChange={(event) => setOldPwd(event.target.value)}
              autoComplete="current-password"
              required
            />
            <NeoInput
              label="新密码"
              type="password"
              value={newPwd}
              onChange={(event) => setNewPwd(event.target.value)}
              autoComplete="new-password"
              required
            />
            <NeoInput
              label="确认新密码"
              type="password"
              value={confirmPwd}
              onChange={(event) => setConfirmPwd(event.target.value)}
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

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{hasEmail ? "更换邮箱" : "绑定邮箱"}</h2>

        {hasEmail ? (
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>当前邮箱</span>
            <span className={styles.fieldValue}>
              {profile?.email}
              <span className={profile?.emailVerifiedAt ? styles.badgeOk : styles.badgeWarn}>
                {profile?.emailVerifiedAt ? "已验证" : "未验证"}
              </span>
            </span>
          </div>
        ) : null}

        {emailMsg ? (
          <div className={`${styles.msg} ${emailMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {emailMsg.text}
          </div>
        ) : null}

        {emailStep === "idle" ? (
          <button className={sec.toggleBtn} onClick={() => setEmailStep("form")}>
            {hasEmail ? "更换邮箱" : "绑定邮箱"}
          </button>
        ) : null}

        {emailStep === "form" ? (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              {hasEmail
                ? "更换邮箱需要同时验证当前邮箱和新邮箱。"
                : "绑定邮箱后，可以使用邮箱找回密码。"}
            </p>
            <NeoInput
              label="当前密码"
              type="password"
              value={emailPassword}
              onChange={(event) => setEmailPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <NeoInput
              label="新邮箱地址"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
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
        ) : null}

        {emailStep === "code-sent" ? (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              验证码已发送到 <strong>{newEmail}</strong>
            </p>
            <NeoInput
              label="验证码"
              value={emailCode}
              onChange={(event) => setEmailCode(event.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <button className={sec.resendBtn} disabled={resendTimer > 0} onClick={handleEmailRequest}>
              {resendTimer > 0 ? `${resendTimer}s 后可重发` : "重新发送验证码"}
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
        ) : null}

        {emailStep === "confirm-codes" ? (
          <div className={sec.emailForm}>
            <p className={sec.emailStepHint}>
              验证码已分别发送到旧邮箱和新邮箱 <strong>{newEmail}</strong>，请输入两组验证码。
            </p>
            <NeoInput
              label="旧邮箱验证码"
              value={oldEmailCode}
              onChange={(event) => setOldEmailCode(event.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <NeoInput
              label="新邮箱验证码"
              value={newEmailCode}
              onChange={(event) => setNewEmailCode(event.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <button className={sec.resendBtn} disabled={resendTimer > 0} onClick={handleEmailRequest}>
              {resendTimer > 0 ? `${resendTimer}s 后可重发` : "重新发送验证码"}
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
        ) : null}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>双重验证（2FA）</h2>
        {twoFactorMsg ? (
          <div className={`${styles.msg} ${twoFactorMsg.ok ? styles.msgOk : styles.msgErr}`}>
            {twoFactorMsg.text}
          </div>
        ) : null}

        <div className={sec.twoFactorHeader}>
          <div>
            <p className={sec.twoFactorTitle}>验证器 App</p>
            <p className={sec.emailStepHint}>
              使用 Google Authenticator、1Password、Microsoft Authenticator 等 App 生成 6 位验证码。
            </p>
          </div>
          <span className={profile?.twoFactorEnabled ? styles.badgeOk : styles.badgeWarn}>
            {profile?.twoFactorEnabled ? "已开启" : "未开启"}
          </span>
        </div>

        {!profile?.twoFactorEnabled && !setupData ? (
          <button className={sec.toggleBtn} onClick={handleStartTwoFactorSetup} disabled={twoFactorBusy}>
            {twoFactorBusy ? "正在生成..." : "开启 2FA"}
          </button>
        ) : null}

        {setupData ? (
          <div className={sec.twoFactorSetup}>
            <div className={sec.qrCard}>
              <img
                src={setupData.qrCodeDataUrl}
                alt="2FA 二维码"
                className={sec.qrImage}
              />
              <div className={sec.manualKey}>
                <span className={styles.fieldLabel}>手动输入密钥</span>
                <code>{setupData.manualEntryKey}</code>
              </div>
            </div>

            <NeoInput
              label="验证器中的 6 位验证码"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <div className={sec.actionRow}>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={handleEnableTwoFactor}
                isLoading={twoFactorBusy}
                disabled={!twoFactorCode.trim()}
              >
                确认启用
              </NeoButton>
              <NeoButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSetupData(null);
                  setTwoFactorCode("");
                  setTwoFactorMsg(null);
                }}
              >
                取消
              </NeoButton>
            </div>
          </div>
        ) : null}

        {profile?.twoFactorEnabled ? (
          <div className={sec.twoFactorManage}>
            <NeoInput
              label="当前密码"
              type="password"
              value={twoFactorPassword}
              onChange={(event) => setTwoFactorPassword(event.target.value)}
              autoComplete="current-password"
            />
            <NeoInput
              label="当前验证码"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              autoComplete="one-time-code"
              placeholder="输入 6 位验证码"
            />
            <div className={sec.actionRow}>
              <NeoButton
                variant="secondary"
                size="sm"
                onClick={handleRegenerateRecoveryCodes}
                isLoading={twoFactorBusy}
              >
                重新生成恢复码
              </NeoButton>
              <NeoButton
                variant="danger"
                size="sm"
                onClick={handleDisableTwoFactor}
                isLoading={twoFactorBusy}
              >
                关闭 2FA
              </NeoButton>
            </div>
          </div>
        ) : null}

        {recoveryCodes.length > 0 ? (
          <div className={sec.recoveryCard}>
            <p className={sec.recoveryTitle}>请保存以下恢复码</p>
            <p className={sec.emailStepHint}>
              每个恢复码只能使用一次。建议把它们保存到密码管理器或离线位置。
            </p>
            <div className={sec.recoveryList}>
              {recoveryCodes.map((code) => (
                <code key={code} className={sec.recoveryCode}>
                  {code}
                </code>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
