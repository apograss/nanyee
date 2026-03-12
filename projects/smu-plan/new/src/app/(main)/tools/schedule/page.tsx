"use client";

import { useState, useCallback, useEffect, FormEvent } from "react";
import Link from "next/link";
import OcrFeedbackPrompt from "@/components/molecules/OcrFeedbackPrompt";
import { recognizeCaptcha } from "@/lib/captcha-ocr";
import s from "../tools.module.css";

export default function SchedulePage() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [campus, setCampus] = useState<"main" | "shunde">("shunde");
  const [format, setFormat] = useState<"wakeup" | "ics">("wakeup");
  const [startDate, setStartDate] = useState("2026-3-2");
  const [totalWeeks, setTotalWeeks] = useState("20");

  const [captchaImage, setCaptchaImage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [autoLoginStatus, setAutoLoginStatus] = useState("");

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

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptcha("");
    try {
      const res = await fetch("/api/tools/captcha");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCaptchaImage(data.image);
      setSessionId(data.sessionId);
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

  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account || !password || !captcha || !sessionId) return;
    setLoading(true);
    setResult(null);
    setCopied(false);
    setLoadingText("正在登录教务系统...");

    try {
      const res = await fetch("/api/tools/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, account, password, captcha, campus, format, startDate, totalWeeks: Number(totalWeeks) }),
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
        setLoadingText("正在拉取课表数据...");
        const data = await res.json();
        if (data.error) {
          setResult({ success: false, error: data.error });
          loadCaptcha();
        } else {
          setResult({ success: true, shareCode: data.shareCode, shareMessage: data.shareMessage, courseCount: data.courseCount, eventCount: data.eventCount });
        }
      }
    } catch {
      setResult({ success: false, error: "网络错误，请检查连接后重试" });
      loadCaptcha();
    }
    setLoading(false);
    setLoadingText("");
  };

  const handleAutoLogin = async () => {
    if (!account || !password) return;
    setLoading(true); setResult(null); setCopied(false);
    setAutoLoginStatus("自动登录中...");

    for (let attempt = 1; attempt <= 3; attempt++) {
      setAutoLoginStatus(`尝试自动登录 (${attempt}/3)...`);
      setCaptchaLoading(true); setCaptcha("");
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
        if (ocrResult) { ocrText = ocrResult.text; setCaptcha(ocrText); }
      } catch {}
      setCaptchaLoading(false);
      if (!ocrText || !sid) { setAutoLoginStatus("验证码识别失败，重试..."); continue; }

      setAutoLoginStatus(`识别: ${ocrText}，提交中...`);
      try {
        const res = await fetch("/api/tools/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, account, password, captcha: ocrText, campus, format, startDate, totalWeeks: Number(totalWeeks) }),
        });
        if (format === "ics" && res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "schedule.ics"; a.click();
          URL.revokeObjectURL(url);
          setResult({ success: true, shareCode: "ICS", shareMessage: "日历文件已下载，请导入到手机日历应用中" });
        } else {
          const data = await res.json();
          if (data.error) { setAutoLoginStatus(`${data.error}，重试...`); continue; }
          setResult({ success: true, shareCode: data.shareCode, shareMessage: data.shareMessage, courseCount: data.courseCount, eventCount: data.eventCount });
        }
        setAutoLoginStatus(""); setLoading(false); setLoadingText(""); return;
      } catch { setAutoLoginStatus("网络错误，重试..."); }
    }
    setAutoLoginStatus("");
    setResult({ success: false, error: "自动登录未成功，请手动输入验证码" });
    loadCaptcha(); setLoading(false); setLoadingText("");
  };

  const handleCopy = async () => {
    if (result?.shareMessage) {
      await navigator.clipboard.writeText(result.shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={s.toolLayout}>
      <div className={s.container}>
        <div className={s.header}>
          <div className={s.logo}>Nanyee<span className={s.logoAccent}>.de</span></div>
          <div className={s.subtitle}>📅 教务课表一键导出</div>
        </div>

        <div className={s.card}>
          <form onSubmit={handleSubmit}>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="account">学号</label>
              <input id="account" className={s.input} type="text" placeholder="请输入教务系统学号" value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" required />
            </div>
            <div className={s.formGroup}>
              <label className={s.label} htmlFor="password">密码</label>
              <input id="password" className={s.input} type="password" placeholder="教务系统密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <div className={s.formGroup}>
              <label className={s.label}>验证码</label>
              <div className={s.captchaRow}>
                <input className={s.input} type="text" placeholder="输入右图数字" value={captcha} onChange={(e) => setCaptcha(e.target.value)} maxLength={6} required />
                <div className={s.captchaBox} onClick={loadCaptcha} title="点击刷新验证码">
                  {captchaLoading ? <span className={s.captchaPlaceholder}>加载中...</span> : captchaImage ? <img src={captchaImage} alt="验证码" /> : <span className={s.captchaPlaceholder}>点击获取</span>}
                </div>
              </div>
              {ocrStatus && <span className={s.ocrStatus}>🤖 {ocrStatus}</span>}
              {captchaImage ? (
                <OcrFeedbackPrompt
                  imageBase64={captchaImage}
                  correctedText={captcha}
                  sourcePage="schedule"
                />
              ) : null}
            </div>

            <div className={s.inlineRow}>
              <div className={s.formGroup}>
                <label className={s.label}>校区</label>
                <div className={s.radioGroup}>
                  <label className={s.radioOption}><input type="radio" name="campus" value="shunde" checked={campus === "shunde"} onChange={() => setCampus("shunde")} /><span className={s.radioLabel}>顺德</span></label>
                  <label className={s.radioOption}><input type="radio" name="campus" value="main" checked={campus === "main"} onChange={() => setCampus("main")} /><span className={s.radioLabel}>本部</span></label>
                </div>
              </div>
              <div className={s.formGroup}>
                <label className={s.label}>导出格式</label>
                <div className={s.radioGroup}>
                  <label className={s.radioOption}><input type="radio" name="format" value="wakeup" checked={format === "wakeup"} onChange={() => setFormat("wakeup")} /><span className={s.radioLabel}>WakeUp</span></label>
                  <label className={s.radioOption}><input type="radio" name="format" value="ics" checked={format === "ics"} onChange={() => setFormat("ics")} /><span className={s.radioLabel}>ICS</span></label>
                </div>
              </div>
            </div>

            <div className={s.inlineRow}>
              <div className={s.formGroup}>
                <label className={s.label} htmlFor="startDate">开学日期</label>
                <input id="startDate" className={s.input} type="text" placeholder="YYYY-M-D" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className={s.formGroup}>
                <label className={s.label} htmlFor="weeks">学期周数</label>
                <input id="weeks" className={s.input} type="number" min="1" max="30" value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value)} required />
              </div>
            </div>

            <button type="submit" className={s.submitBtn} disabled={loading || !account || !password || !captcha}>
              {loading ? <span className={s.loading}><span className={s.spinner} />{loadingText || autoLoginStatus || "处理中..."}</span> : "🚀 一键导出"}
            </button>
          </form>

          <button type="button" className={s.secondaryBtn} style={{ marginTop: "0.5rem" }} disabled={loading || !account || !password} onClick={handleAutoLogin}>
            {autoLoginStatus ? <span className={s.loading}><span className={s.spinner} />{autoLoginStatus}</span> : "🤖 一键导出（自动识别验证码）"}
          </button>

          <div className={s.privacyNote}>
            🔒 你的密码仅用于登录教务系统，不会被存储。
          </div>
        </div>

        {result && (
          <div className={s.result}>
            {result.success ? (
              <div className={`${s.resultCard} ${s.resultSuccess}`}>
                <div className={s.resultTitle}>✅ 导出成功</div>
                {result.shareCode === "ICS" ? (
                  <p className={s.errorText}>{result.shareMessage}</p>
                ) : (
                  <>
                    <div className={s.shareCodeBox}>
                      分享口令：<span className={s.shareCode}>{result.shareCode}</span>
                      <br /><br />
                      打开 WakeUp 课程表 App → 右上角第二个按钮 → 从分享口令导入
                    </div>
                    <button className={s.copyBtn} onClick={handleCopy}>
                      {copied ? "✓ 已复制" : "📋 复制完整分享消息"}
                    </button>
                    <div className={s.resultMeta}>
                      共 {result.courseCount} 门课程，{result.eventCount} 个课时
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className={`${s.resultCard} ${s.resultError}`}>
                <div className={s.resultTitle}>❌ 导出失败</div>
                <p className={s.errorText}>{result.error}</p>
              </div>
            )}
          </div>
        )}

        <div className={s.footer}>
          <Link href="/tools/grades" style={{ color: "inherit", textDecoration: "none" }}>📊 成绩查询</Link>
          {" · "}
          <Link href="/tools/enroll" style={{ color: "inherit", textDecoration: "none" }}>⚡ 自动选课</Link>
          {" · "}
          <Link href="/">Nanyee.de</Link>
        </div>
      </div>
    </div>
  );
}
