"use client";

import { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import Link from "next/link";
import { recognizeCaptcha } from "@/lib/captcha-ocr";

// ─── Credential helpers (shared key "smu_creds") ────────────
function saveCredentials(account: string, password: string) {
  try { localStorage.setItem("smu_account", account); localStorage.setItem("smu_password", btoa(password)); } catch { }
}
function loadCredentials(): { account: string; password: string } | null {
  try {
    const a = localStorage.getItem("smu_account"); const p = localStorage.getItem("smu_password");
    if (a && p) return { account: a, password: atob(p) };
  } catch { } return null;
}
function clearCredentials() {
  try { localStorage.removeItem("smu_account"); localStorage.removeItem("smu_password"); } catch { }
}

export default function SchedulePage() {
  // Form state
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [campus, setCampus] = useState<"main" | "shunde">("shunde");
  const [format, setFormat] = useState<"wakeup" | "ics">("wakeup");
  const [startDate, setStartDate] = useState("2026-3-2");
  const [totalWeeks, setTotalWeeks] = useState("20");

  // Captcha state
  const [captchaImage, setCaptchaImage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [autoLoginStatus, setAutoLoginStatus] = useState("");
  const loadedFromStorage = useRef(false);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [result, setResult] = useState<{
    success: boolean;
    shareCode?: string;
    shareMessage?: string;
    courseCount?: number;
    eventCount?: number;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load saved credentials
  useEffect(() => {
    const creds = loadCredentials();
    if (creds) {
      setAccount(creds.account);
      setPassword(creds.password);
      setRememberMe(true);
      loadedFromStorage.current = true;
    }
  }, []);

  // Fetch captcha + auto-OCR
  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptcha("");
    try {
      const res = await fetch("/api/tools/captcha");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCaptchaImage(data.image);
      setSessionId(data.sessionId);

      // Auto-OCR
      setOcrStatus("识别验证码中...");
      try {
        const ocrResult = await recognizeCaptcha(data.image);
        if (ocrResult) {
          setCaptcha(ocrResult.text);
          setOcrStatus(`已识别: ${ocrResult.text}`);
          setTimeout(() => setOcrStatus(""), 2000);
        } else {
          setOcrStatus("自动识别失败，请手动输入");
          setTimeout(() => setOcrStatus(""), 3000);
        }
      } catch { setOcrStatus(""); }
    } catch {
      setCaptchaImage("");
      setSessionId("");
    }
    setCaptchaLoading(false);
  }, []);

  // Auto-load captcha on first render
  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  // Submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account || !password || !captcha || !sessionId) return;

    if (rememberMe) saveCredentials(account, password);
    else clearCredentials();

    setLoading(true);
    setResult(null);
    setCopied(false);
    setLoadingText("正在登录教务系统...");

    try {
      const res = await fetch("/api/tools/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          account,
          password,
          captcha,
          campus,
          format,
          startDate,
          totalWeeks: Number(totalWeeks),
        }),
      });

      if (format === "ics" && res.ok) {
        // Download ICS file
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "schedule.ics";
        a.click();
        URL.revokeObjectURL(url);
        setResult({
          success: true,
          shareCode: "ICS",
          shareMessage: "日历文件已下载，请导入到手机日历应用中",
        });
      } else {
        setLoadingText("正在拉取课表数据...");
        const data = await res.json();

        if (data.error) {
          setResult({ success: false, error: data.error });
          // Auto-refresh captcha on error
          loadCaptcha();
        } else {
          setResult({
            success: true,
            shareCode: data.shareCode,
            shareMessage: data.shareMessage,
            courseCount: data.courseCount,
            eventCount: data.eventCount,
          });
        }
      }
    } catch {
      setResult({ success: false, error: "网络错误，请检查连接后重试" });
      loadCaptcha();
    }

    setLoading(false);
    setLoadingText("");
  };

  // ─── Auto-Login (3 captcha retries) ─────────────────────────
  const handleAutoLogin = async () => {
    if (!account || !password) return;
    setLoading(true);
    setResult(null);
    setCopied(false);
    setAutoLoginStatus("自动登录中...");

    for (let attempt = 1; attempt <= 3; attempt++) {
      setAutoLoginStatus(`尝试自动登录 (${attempt}/3)...`);
      // Fetch fresh captcha + OCR
      setCaptchaLoading(true);
      setCaptcha("");
      let ocrText: string | null = null;
      let sid = "";
      try {
        const res = await fetch("/api/tools/captcha");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCaptchaImage(data.image);
        setSessionId(data.sessionId);
        sid = data.sessionId;
        const ocrResult = await recognizeCaptcha(data.image);
        if (ocrResult) {
          ocrText = ocrResult.text;
          setCaptcha(ocrText);
        }
      } catch { /* ignore */ }
      setCaptchaLoading(false);

      if (!ocrText || !sid) {
        setAutoLoginStatus("验证码识别失败，重试...");
        continue;
      }

      setAutoLoginStatus(`识别: ${ocrText}，提交中...`);
      try {
        const res = await fetch("/api/tools/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            account,
            password,
            captcha: ocrText,
            campus,
            format,
            startDate,
            totalWeeks: Number(totalWeeks),
          }),
        });

        if (format === "ics" && res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "schedule.ics";
          a.click();
          URL.revokeObjectURL(url);
          setResult({ success: true, shareCode: "ICS", shareMessage: "日历文件已下载，请导入到手机日历应用中" });
        } else {
          const data = await res.json();
          if (data.error) {
            setAutoLoginStatus(`${data.error}，重试...`);
            continue;
          }
          setResult({
            success: true,
            shareCode: data.shareCode,
            shareMessage: data.shareMessage,
            courseCount: data.courseCount,
            eventCount: data.eventCount,
          });
        }

        if (rememberMe) saveCredentials(account, password);
        else clearCredentials();
        setAutoLoginStatus("");
        setLoading(false);
        setLoadingText("");
        return;
      } catch {
        setAutoLoginStatus("网络错误，重试...");
      }
    }

    setAutoLoginStatus("");
    setResult({ success: false, error: "自动登录未成功，请手动输入验证码" });
    loadCaptcha();
    setLoading(false);
    setLoadingText("");
  };

  // Copy share message
  const handleCopy = async () => {
    if (result?.shareMessage) {
      await navigator.clipboard.writeText(result.shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div className="header">
          <div className="logo">
            nanyee<span>.de</span>
          </div>
          <div className="subtitle">📅 教务课表一键导出</div>
        </div>

        {/* Form Card */}
        <div className="card">
          <form onSubmit={handleSubmit}>
            {/* Account */}
            <div className="formGroup">
              <label className="label" htmlFor="account">
                学号
              </label>
              <input
                id="account"
                className="input"
                type="text"
                placeholder="请输入教务系统学号"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {/* Password */}
            <div className="formGroup">
              <label className="label" htmlFor="password">
                密码
              </label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder="教务系统密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {/* Captcha */}
            <div className="formGroup">
              <label className="label">验证码</label>
              <div className="captchaRow">
                <input
                  className="input"
                  type="text"
                  placeholder="输入右图数字"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  maxLength={6}
                  required
                />
                <div
                  className="captchaBox"
                  onClick={loadCaptcha}
                  title="点击刷新验证码"
                >
                  {captchaLoading ? (
                    <span className="captchaPlaceholder">加载中...</span>
                  ) : captchaImage ? (
                    <img src={captchaImage} alt="验证码" />
                  ) : (
                    <span className="captchaPlaceholder">点击获取</span>
                  )}
                </div>
              </div>
              {ocrStatus && (
                <span style={{ fontSize: "0.7rem", color: "var(--accent-light)", marginTop: "0.3rem", display: "block" }}>
                  🤖 {ocrStatus}
                </span>
              )}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-dim)", cursor: "pointer", marginBottom: "0.5rem" }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              记住我（下次自动识别验证码登录）
            </label>


            <div className="inlineRow">
              <div className="formGroup">
                <label className="label">校区</label>
                <div className="radioGroup">
                  <label className="radioOption">
                    <input
                      type="radio"
                      name="campus"
                      value="shunde"
                      checked={campus === "shunde"}
                      onChange={() => setCampus("shunde")}
                    />
                    <span className="radioLabel">顺德</span>
                  </label>
                  <label className="radioOption">
                    <input
                      type="radio"
                      name="campus"
                      value="main"
                      checked={campus === "main"}
                      onChange={() => setCampus("main")}
                    />
                    <span className="radioLabel">本部</span>
                  </label>
                </div>
              </div>
              <div className="formGroup">
                <label className="label">导出格式</label>
                <div className="radioGroup">
                  <label className="radioOption">
                    <input
                      type="radio"
                      name="format"
                      value="wakeup"
                      checked={format === "wakeup"}
                      onChange={() => setFormat("wakeup")}
                    />
                    <span className="radioLabel">WakeUp</span>
                  </label>
                  <label className="radioOption">
                    <input
                      type="radio"
                      name="format"
                      value="ics"
                      checked={format === "ics"}
                      onChange={() => setFormat("ics")}
                    />
                    <span className="radioLabel">ICS</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Start date & Weeks */}
            <div className="inlineRow">
              <div className="formGroup">
                <label className="label" htmlFor="startDate">
                  开学日期
                </label>
                <input
                  id="startDate"
                  className="input"
                  type="text"
                  placeholder="YYYY-M-D"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="formGroup">
                <label className="label" htmlFor="weeks">
                  学期周数
                </label>
                <input
                  id="weeks"
                  className="input"
                  type="number"
                  min="1"
                  max="30"
                  value={totalWeeks}
                  onChange={(e) => setTotalWeeks(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="submitBtn"
              disabled={loading || !account || !password || !captcha}
            >
              {loading ? (
                <span className="loading">
                  <span className="spinner" />
                  {loadingText || autoLoginStatus || "处理中..."}
                </span>
              ) : (
                "🚀 一键导出"
              )}
            </button>
          </form>

          {/* Auto-login button */}
          <button
            type="button"
            className="submitBtn"
            style={{ marginTop: "0.5rem", background: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-hover) 100%)", border: "1px solid var(--border)" }}
            disabled={loading || !account || !password}
            onClick={handleAutoLogin}
          >
            {autoLoginStatus ? (
              <span className="loading">
                <span className="spinner" />
                {autoLoginStatus}
              </span>
            ) : (
              "🤖 一键导出（自动识别验证码）"
            )}
          </button>

          {/* Privacy note */}
          <div className="privacyNote">
            🔒 你的密码仅用于登录教务系统，不会被存储。
            <br />
            本项目{" "}
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noreferrer"
            >
              完全开源
            </a>
            ，可自行审计代码。
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="result">
            {result.success ? (
              <div className="resultCard resultSuccess">
                <div className="resultTitle">✅ 导出成功</div>
                {result.shareCode === "ICS" ? (
                  <p className="errorText">{result.shareMessage}</p>
                ) : (
                  <>
                    <div className="shareCodeBox">
                      分享口令：
                      <span className="shareCode">{result.shareCode}</span>
                      <br />
                      <br />
                      打开 WakeUp 课程表 App → 右上角第二个按钮 → 从分享口令导入
                    </div>
                    <button className="copyBtn" onClick={handleCopy}>
                      {copied ? "✓ 已复制" : "📋 复制完整分享消息"}
                    </button>
                    <div className="resultMeta">
                      共 {result.courseCount} 门课程，{result.eventCount} 个课时
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="resultCard resultError">
                <div className="resultTitle">❌ 导出失败</div>
                <p className="errorText">{result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <Link href="/tools/grades" style={{ color: "var(--text-dim)", textDecoration: "none" }}>
            📊 成绩查询
          </Link>
          {" · "}
          <Link href="/tools/enroll" style={{ color: "var(--text-dim)", textDecoration: "none" }}>
            ⚡ 自动选课
          </Link>
          {" · "}
          <a href="https://nanyee.de">nanyee.de</a>  ·  南医的 AI Agent
          <br />
          基于{" "}
          <a
            href="https://github.com/rep1ace/WakeUp4SMU"
            target="_blank"
            rel="noreferrer"
          >
            WakeUp4SMU
          </a>{" "}
          改写
        </div>
      </div>
    </div>
  );
}
