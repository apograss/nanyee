"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  fetchCaptchaViaProxy,
  loginViaProxy,
  cookieLoginViaProxy,
  getCategoriesViaProxy,
  getCoursesViaProxy,
  enrollJobViaProxy,
  calibrateTimeViaProxy,
  computeRunAt,
  setActiveProxy,
  getActiveProxy,
  PROXY_NODES,
  type CourseCategory,
  type CourseItem,
  type LogCallback,
} from "@/lib/enroll-client";
import OcrFeedbackPrompt from "@/components/molecules/OcrFeedbackPrompt";
import { recognizeCaptcha } from "@/lib/captcha-ocr";
import s from "./enroll.module.css";

/* ─── Types ───────────────────────────────────────── */

interface LogEntry {
  type: string;
  message: string;
  index?: number;
  course?: string;
}

type Step = "login" | "categories" | "courses" | "enroll";

/* ─── Credential Helpers ──────────────────────────── */

/* ─── Step Indicator Helper ───────────────────────── */

const STEPS: Step[] = ["login", "categories", "courses", "enroll"];

function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

/* ─── Component ───────────────────────────────────── */

export default function EnrollPage() {
  /* ── step / loading / error ── */
  const [step, setStep] = useState<Step>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ── auth ── */
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loginMode, setLoginMode] = useState<"sso" | "cookie">("sso");
  const [cookieInput, setCookieInput] = useState("");

  /* ── data ── */
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [categoryUrl, setCategoryUrl] = useState("");

  /* ── preferences ── */
  const [pref1, setPref1] = useState("");
  const [pref2, setPref2] = useState("");
  const [pref3, setPref3] = useState("");
  const [pref4, setPref4] = useState("");
  const [scheduledTime, setScheduledTime] = useState("13:00:00");

  /* ── log ── */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [enrollDone, setEnrollDone] = useState(false);

  /* ── auto-login ── */
  const [autoLoginStatus, setAutoLoginStatus] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");

  const logRef = useRef<HTMLDivElement>(null);

  /* ── proxy node ── */
  const [proxyId, setProxyId] = useState(PROXY_NODES[0].id);

  const handleProxyChange = (id: string) => {
    setProxyId(id);
    setActiveProxy(id);
  };

  /* ── load saved credentials on mount ── */
  /* ── auto-scroll log console ── */
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  /* ── prevent accidental tab close during enrollment ── */
  useEffect(() => {
    if (step === "enroll" && !enrollDone) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
  }, [step, enrollDone]);

  /* ── load captcha ── */
  const loadCaptcha = useCallback(async () => {
    setCaptcha("");
    setOcrStatus("");
    try {
      const data = await fetchCaptchaViaProxy();
      setCaptchaImg(data.imageBase64);
      setSessionId(data.sessionId);

      // Browser-side OCR
      setOcrStatus("识别验证码中...");
      try {
        const ocrResult = await recognizeCaptcha(data.imageBase64);
        if (ocrResult) {
          setCaptcha(ocrResult.text);
          setOcrStatus(`已识别: ${ocrResult.text}`);
          setTimeout(() => setOcrStatus(""), 2000);
        } else {
          setOcrStatus("自动识别失败，请手动输入");
          setTimeout(() => setOcrStatus(""), 3000);
        }
      } catch {
        setOcrStatus("");
      }
    } catch {
      setCaptchaImg("");
      setSessionId("");
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  /* ── Bookmarklet: auto-detect cookie from URL hash on mount ── */
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#cookie=")) {
      const raw = decodeURIComponent(hash.slice(8));
      if (raw) {
        setCookieInput(raw);
        setLoginMode("cookie");
        // Clean URL hash
        window.history.replaceState(null, "", window.location.pathname);
        // Auto-login with cookie
        (async () => {
          setLoading(true);
          setError("");
          try {
            const nextSessionId = await cookieLoginViaProxy(raw);
            setSessionId(nextSessionId);
            const catResult = await getCategoriesViaProxy(nextSessionId);
            setCategories(catResult.categories);
            setStep("categories");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Cookie 自动登录失败");
          }
          setLoading(false);
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═══════════════════════════════════════════════════
     Step 1 → 2: Manual Login
     ═══════════════════════════════════════════════════ */
  const handleLogin = async () => {
    if (!account || !password || !captcha) return;
    setLoading(true);
    setError("");

    try {
      const nextSessionId = await loginViaProxy(account, password, captcha, sessionId);
      setSessionId(nextSessionId);
      const catResult = await getCategoriesViaProxy(nextSessionId);
      setCategories(catResult.categories);
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      loadCaptcha();
    }

    setLoading(false);
  };

  /* ═══════════════════════════════════════════════════
     Step 1 → 2: Cookie Login (reuse browser session)
     ═══════════════════════════════════════════════════ */
  const handleCookieLogin = async () => {
    if (!cookieInput.trim()) return;
    setLoading(true);
    setError("");

    try {
      const nextSessionId = await cookieLoginViaProxy(cookieInput);
      setSessionId(nextSessionId);
      const catResult = await getCategoriesViaProxy(nextSessionId);
      setCategories(catResult.categories);
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cookie 登录失败");
    }

    setLoading(false);
  };

  /* ═══════════════════════════════════════════════════
     Step 1 → 2: Auto Login (OCR x3)
     ═══════════════════════════════════════════════════ */
  const handleAutoLogin = async () => {
    if (!account || !password) return;
    setLoading(true);
    setError("");
    setAutoLoginStatus("自动登录中...");

    for (let attempt = 1; attempt <= 3; attempt++) {
      setAutoLoginStatus(`尝试自动登录 (${attempt}/3)...`);

      let ocrText: string | null = null;
      let nextSessionId = "";

      try {
        const data = await fetchCaptchaViaProxy();
        setCaptchaImg(data.imageBase64);
        nextSessionId = data.sessionId;
        setSessionId(data.sessionId);

        const ocrResult = await recognizeCaptcha(data.imageBase64);
        if (ocrResult) ocrText = ocrResult.text;
        if (ocrText) setCaptcha(ocrText);
      } catch { }

      if (!ocrText) {
        setAutoLoginStatus("验证码识别失败，重试...");
        continue;
      }

      setAutoLoginStatus(`识别: ${ocrText}，提交中...`);

      try {
        const loggedInSessionId = await loginViaProxy(account, password, ocrText, nextSessionId);
        setSessionId(loggedInSessionId);
        const catResult = await getCategoriesViaProxy(loggedInSessionId);
        setCategories(catResult.categories);

        setAutoLoginStatus("");
        setLoading(false);
        setStep("categories");
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "登录失败";
        setAutoLoginStatus(`${msg}，重试...`);
      }
    }

    setAutoLoginStatus("");
    setError("自动登录未成功，请手动输入验证码");
    loadCaptcha();
    setLoading(false);
  };

  /* ═══════════════════════════════════════════════════
     Step 2 → 3: Select Category → Load Courses
     ═══════════════════════════════════════════════════ */
  const handleSelectCategory = async (code: string) => {
    setLoading(true);
    setError("");

    try {
      const result = await getCoursesViaProxy(sessionId, code);
      setCourses(result.courses);
      setCategoryUrl(result.categoryUrl);
      setStep("courses");
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取课程列表失败");
    }

    setLoading(false);
  };

  /* ═══════════════════════════════════════════════════
     Step 3 → 4: Start Enrollment
     ═══════════════════════════════════════════════════ */
  const handleEnroll = async () => {
    if (!pref1) {
      setError("请至少选择第一志愿");
      return;
    }

    const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!timeRegex.test(scheduledTime)) {
      setError("时间格式错误，请使用 HH:MM:SS");
      return;
    }

    setStep("enroll");
    setLogs([]);
    setEnrollDone(false);
    setError("");

    const preferences: (number | null)[] = [
      pref1 ? Number(pref1) : null,
      pref2 ? Number(pref2) : null,
      pref3 ? Number(pref3) : null,
      pref4 ? Number(pref4) : null,
    ];

    const logger: LogCallback = (event) => {
      setLogs((prev) => [...prev, event]);
    };

    try {
      /* 1. Log proxy info */
      const proxy = getActiveProxy();
      logger({ type: "info", message: `使用代理: ${proxy?.label || "未知"} (${proxy?.region})` });

      /* 2. Calibrate time */
      logger({ type: "calibrating", message: "正在校准服务器时间..." });
      const timeDiff = await calibrateTimeViaProxy(sessionId);
      logger({
        type: "calibrating",
        message: `时间校准完成: 本地与服务器差 ${timeDiff > 0 ? "+" : ""}${timeDiff}ms`,
      });

      /* 2. Wait for scheduled time */
      const runAt = computeRunAt(scheduledTime, timeDiff);
      const waitMs = runAt - Date.now();

      if (waitMs > 0) {
        logger({
          type: "waiting",
          message: `等待开始: ${new Date(runAt).toLocaleTimeString()} (${Math.ceil(waitMs / 1000)}s)`,
        });
        await new Promise((r) => setTimeout(r, waitMs));
        logger({ type: "info", message: "时间到，开始选课!" });
      } else {
        logger({ type: "info", message: "已过目标时间，立即开始选课" });
      }

      /* 3. Execute enrollment */
      const result = await enrollJobViaProxy(preferences, courses, categoryUrl, sessionId, logger);

      if (result.success) {
        logger({ type: "success", message: result.message });
      } else {
        logger({ type: "fail", message: result.message });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger({ type: "error", message: `异常终止: ${msg}` });
    }

    setEnrollDone(true);
  };

  /* ─── Build course select options ─── */
  const courseOptions = courses.map((c, i) => (
    <option key={c.kcrwdm} value={i + 1}>
      {i + 1}. {c.kcmc} ({c.teaxm})
    </option>
  ));

  /* ─── Determine last log outcome ─── */
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const enrollSuccess = lastLog?.type === "success";
  const enrollFail = lastLog?.type === "fail" || lastLog?.type === "error";

  /* ═══════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════ */
  return (
    <div className={s.enrollPage}>
      <div className={s.container}>
        {/* Back link */}
        <Link href="/tools" className={s.backLink}>
          &larr; 返回工具列表
        </Link>

        {/* Header */}
        <div className={s.header}>
          <h1>自动选课</h1>
          <p>设定志愿与时间，系统自动抢课</p>
        </div>

        {/* Proxy node selector */}
        {step === "login" && (
          <div className={s.proxySelector}>
            <span className={s.proxySelectorLabel}>📡 代理节点</span>
            <div className={s.proxyOptions}>
              {PROXY_NODES.map((node) => (
                <label
                  key={node.id}
                  className={[
                    s.proxyOption,
                    proxyId === node.id ? s.proxyOptionActive : "",
                  ].filter(Boolean).join(" ")}
                >
                  <input
                    type="radio"
                    name="proxy-node"
                    value={node.id}
                    checked={proxyId === node.id}
                    onChange={() => handleProxyChange(node.id)}
                  />
                  {node.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step indicator */}
        <div className={s.stepIndicator}>
          {STEPS.map((st, i) => (
            <div
              key={st}
              className={[
                s.stepDot,
                stepIndex(step) === i ? s.active : "",
                stepIndex(step) > i ? s.done : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>

        {/* Error banner */}
        {error && <div className={s.errorBanner}>{error}</div>}

        {/* Auto-login status banner */}
        {autoLoginStatus && (
          <div className={s.autoLoginBanner}>
            <span className={s.spinner} />
            {autoLoginStatus}
          </div>
        )}

        {/* ─────────── Step 1: Login ─────────── */}
        {step === "login" && (
          <div className={s.card}>
            <h2>登录教务系统</h2>

            {/* Session warning */}
            <div style={{
              background: "rgba(255, 170, 0, 0.08)",
              border: "1px solid rgba(255, 170, 0, 0.25)",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              fontSize: "var(--text-xs)",
              lineHeight: 1.6,
              color: "var(--text-secondary)",
            }}>
              ⚠️ <strong style={{ color: "#ffaa00" }}>重要提示</strong>：学校教务系统<strong>只允许同时登录一个会话</strong>。
              <br />
              • <strong>账号密码登录</strong>：会创建新会话，<span style={{ color: "#ff6b6b" }}>你在浏览器中的登录会被踢下线</span>
              <br />
              • <strong>Cookie 登录</strong>：复用浏览器会话，<span style={{ color: "#51cf66" }}>不会踢下线，推荐使用</span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <button
                className={loginMode === "sso" ? s.btnPrimary : s.btnSecondary}
                onClick={() => setLoginMode("sso")}
                style={{ flex: 1, padding: "0.5rem" }}
              >
                账号密码登录
              </button>
              <button
                className={loginMode === "cookie" ? s.btnPrimary : s.btnSecondary}
                onClick={() => setLoginMode("cookie")}
                style={{ flex: 1, padding: "0.5rem" }}
              >
                🍪 Cookie 登录（推荐）
              </button>
            </div>

            {loginMode === "sso" && (
              <>
                <div className={s.formGroup}>
                  <label htmlFor="enroll-account">学号</label>
                  <input
                    id="enroll-account"
                    type="text"
                    placeholder="请输入教务系统学号"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    autoComplete="username"
                  />
                </div>

                <div className={s.formGroup}>
                  <label htmlFor="enroll-password">密码</label>
                  <input
                    id="enroll-password"
                    type="password"
                    placeholder="教务系统密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                <div className={s.formGroup}>
                  <label>验证码</label>
                  <div className={s.captchaRow}>
                    <input
                      type="text"
                      placeholder="输入右图数字"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value)}
                      maxLength={6}
                    />
                    <div className={s.captchaImg} onClick={loadCaptcha} title="点击刷新验证码">
                      {captchaImg ? (
                        <img src={captchaImg} alt="验证码" />
                      ) : (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                          点击获取
                        </span>
                      )}
                    </div>
                  </div>
                  {ocrStatus && (
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--text-xs)",
                        color: "var(--color-brand)",
                        marginTop: "var(--space-xs)",
                      }}
                    >
                      {ocrStatus}
                    </span>
                  )}
                  {captchaImg ? (
                    <OcrFeedbackPrompt
                      imageBase64={captchaImg}
                      correctedText={captcha}
                      sourcePage="enroll"
                    />
                  ) : null}
                </div>

                <button
                  className={s.btnPrimary}
                  disabled={loading || !account || !password || !captcha}
                  onClick={handleLogin}
                >
                  {loading && !autoLoginStatus ? (
                    <>
                      <span className={s.spinner} />
                      登录中...
                    </>
                  ) : (
                    "登录"
                  )}
                </button>

                <button
                  className={s.btnSecondary}
                  disabled={loading || !account || !password}
                  onClick={handleAutoLogin}
                >
                  {autoLoginStatus ? (
                    <>
                      <span className={s.spinner} />
                      {autoLoginStatus}
                    </>
                  ) : (
                    "一键登录（自动识别验证码）"
                  )}
                </button>
              </>
            )}

            {loginMode === "cookie" && (
              <>
                {/* Tutorial */}
                <div style={{
                  background: "rgba(100, 160, 255, 0.06)",
                  border: "1px solid rgba(100, 160, 255, 0.15)",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                  marginBottom: "1rem",
                  fontSize: "var(--text-xs)",
                  lineHeight: 1.7,
                  color: "var(--text-secondary)",
                }}>
                  <strong style={{ color: "var(--text-primary)" }}>如何获取 Cookie？</strong>
                  <br />
                  登录 <a href="https://zhjw.smu.edu.cn" target="_blank" rel="noreferrer" style={{ color: "var(--color-brand)", textDecoration: "underline" }}>zhjw.smu.edu.cn</a> 后，在浏览器按 <strong>F12</strong> → <strong>应用程序(Application)</strong> → <strong>Cookie</strong> → 找到 <strong>JSESSIONID</strong>，复制它的值。
                  <br />
                  <span style={{ color: "var(--text-muted)" }}>
                    💡 推荐安装 <a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noreferrer" style={{ color: "var(--color-brand)" }}>Cookie-Editor</a> 浏览器扩展，一键查看和复制 Cookie，更方便。
                  </span>
                </div>

                {/* Manual cookie input */}
                <div className={s.formGroup}>
                  <label>Cookie / JSESSIONID</label>
                  <input
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    placeholder="F12 → Application → Cookies → 复制 JSESSIONID 值"
                    onKeyDown={(e) => e.key === "Enter" && handleCookieLogin()}
                  />
                </div>
                <button
                  className={s.btnPrimary}
                  onClick={handleCookieLogin}
                  disabled={loading || !cookieInput.trim()}
                >
                  {loading ? (
                    <>
                      <span className={s.spinner} />
                      验证中...
                    </>
                  ) : (
                    "🍪 Cookie 登录"
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* ─────────── Step 2: Categories ─────────── */}
        {step === "categories" && (
          <div className={s.card}>
            <h2>选择选课类型</h2>

            {loading ? (
              <div style={{ textAlign: "center", padding: "var(--space-lg)" }}>
                <span className={s.spinner} />
              </div>
            ) : (
              <div className={s.categoryList}>
                {categories.map((cat) => (
                  <div
                    key={cat.code}
                    className={s.categoryItem}
                    onClick={() => handleSelectCategory(cat.code)}
                  >
                    {cat.title}
                  </div>
                ))}
              </div>
            )}

            <button
              className={s.btnSecondary}
              onClick={() => {
                setStep("login");
                setError("");
                loadCaptcha();
              }}
            >
              &larr; 返回登录
            </button>
          </div>
        )}

        {/* ─────────── Step 3: Courses ─────────── */}
        {step === "courses" && (
          <div className={s.card}>
            <h2>课程列表与志愿设置</h2>

            {/* Course table */}
            <div className={s.courseTableWrap}>
              <table className={s.courseTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>课程名称</th>
                    <th>教师</th>
                    <th>容量</th>
                    <th>学分</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr key={c.kcrwdm}>
                      <td>{i + 1}</td>
                      <td>{c.kcmc}</td>
                      <td>{c.teaxm}</td>
                      <td>
                        {c.xkrs}/{c.pkrs}
                      </td>
                      <td>{c.xf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Preference selects */}
            <div className={s.prefRow}>
              <div className={s.formGroup}>
                <label>第一志愿 *</label>
                <select value={pref1} onChange={(e) => setPref1(e.target.value)}>
                  <option value="">-- 选择 --</option>
                  {courseOptions}
                </select>
              </div>
              <div className={s.formGroup}>
                <label>第二志愿</label>
                <select value={pref2} onChange={(e) => setPref2(e.target.value)}>
                  <option value="">-- 可选 --</option>
                  {courseOptions}
                </select>
              </div>
              <div className={s.formGroup}>
                <label>第三志愿</label>
                <select value={pref3} onChange={(e) => setPref3(e.target.value)}>
                  <option value="">-- 可选 --</option>
                  {courseOptions}
                </select>
              </div>
              <div className={s.formGroup}>
                <label>第四志愿</label>
                <select value={pref4} onChange={(e) => setPref4(e.target.value)}>
                  <option value="">-- 可选 --</option>
                  {courseOptions}
                </select>
              </div>
            </div>

            {/* Scheduled time */}
            <div className={s.formGroup}>
              <label htmlFor="enroll-time">定时开始 (HH:MM:SS)</label>
              <input
                id="enroll-time"
                type="text"
                placeholder="13:00:00"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>

            <button
              className={s.btnPrimary}
              disabled={!pref1}
              onClick={handleEnroll}
            >
              开始选课
            </button>

            <button
              className={s.btnSecondary}
              onClick={() => {
                setStep("categories");
                setError("");
                setCourses([]);
                setPref1("");
                setPref2("");
                setPref3("");
                setPref4("");
              }}
            >
              &larr; 返回选课类型
            </button>
          </div>
        )}

        {/* ─────────── Step 4: Enroll Log ─────────── */}
        {step === "enroll" && (
          <div className={s.card}>
            <h2>选课日志</h2>

            {/* Warning banner */}
            {!enrollDone && (
              <div className={s.autoLoginBanner} style={{ marginBottom: "var(--space-md)" }}>
                ⚠️ 抢课进行中，请勿关闭此页面
              </div>
            )}

            {/* Result banners */}
            {enrollDone && enrollSuccess && (
              <div className={s.successBanner}>🎉 选课成功!</div>
            )}
            {enrollDone && enrollFail && (
              <div className={s.errorBanner}>
                {lastLog?.message || "选课未成功"}
              </div>
            )}

            {/* Log console */}
            <div className={s.logConsole} ref={logRef}>
              {logs.map((entry, i) => (
                <div
                  key={i}
                  className={[s.logLine, s[entry.type] || ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {entry.message}
                </div>
              ))}
              {!enrollDone && (
                <div className={s.logLine}>
                  <span className={s.spinner} style={{ width: 12, height: 12 }} />
                </div>
              )}
            </div>

            {/* Back to courses when done */}
            {enrollDone && (
              <button
                className={s.btnSecondary}
                onClick={() => {
                  setStep("courses");
                  setLogs([]);
                  setEnrollDone(false);
                  setError("");
                }}
              >
                &larr; 返回课程列表
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
