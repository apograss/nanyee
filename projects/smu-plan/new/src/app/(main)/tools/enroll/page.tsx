"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  fetchCaptchaViaProxy,
  loginViaProxy,
  getCategoriesViaProxy,
  getCoursesViaProxy,
  enrollJobViaProxy,
  calibrateTimeViaProxy,
  computeRunAt,
  type CourseCategory,
  type CourseItem,
  type LogCallback,
} from "@/lib/enroll-client";
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

function saveCredentials(a: string, p: string) {
  try {
    localStorage.setItem("smu_account", a);
    localStorage.setItem("smu_password", btoa(p));
  } catch {}
}

function loadCredentials(): { account: string; password: string } | null {
  try {
    const a = localStorage.getItem("smu_account");
    const p = localStorage.getItem("smu_password");
    if (a && p) return { account: a, password: atob(p) };
  } catch {}
  return null;
}

function clearCredentials() {
  try {
    localStorage.removeItem("smu_account");
    localStorage.removeItem("smu_password");
  } catch {}
}

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
  const [uisCookies, setUisCookies] = useState<string[]>([]);
  const [cookies, setCookies] = useState<string[]>([]);
  const [rememberMe, setRememberMe] = useState(false);

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
  const loadedFromStorage = useRef(false);

  /* ── load saved credentials on mount ── */
  useEffect(() => {
    const creds = loadCredentials();
    if (creds) {
      setAccount(creds.account);
      setPassword(creds.password);
      setRememberMe(true);
      loadedFromStorage.current = true;
    }
  }, []);

  /* ── auto-scroll log console ── */
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  /* ── load captcha ── */
  const loadCaptcha = useCallback(async () => {
    setCaptcha("");
    setOcrStatus("");
    try {
      const data = await fetchCaptchaViaProxy();
      setCaptchaImg(data.imageBase64);
      setUisCookies(data.cookies);

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
      setUisCookies([]);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  /* ═══════════════════════════════════════════════════
     Step 1 → 2: Manual Login
     ═══════════════════════════════════════════════════ */
  const handleLogin = async () => {
    if (!account || !password || !captcha) return;
    setLoading(true);
    setError("");

    try {
      if (rememberMe) saveCredentials(account, password);
      else clearCredentials();

      const sessionCookies = await loginViaProxy(account, password, captcha, uisCookies);
      setCookies(sessionCookies);

      const catResult = await getCategoriesViaProxy(sessionCookies);
      setCategories(catResult.categories);
      setCookies(catResult.cookies);
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      loadCaptcha();
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
      let captchaCookies: string[] = [];

      try {
        const data = await fetchCaptchaViaProxy();
        setCaptchaImg(data.imageBase64);
        captchaCookies = data.cookies;
        setUisCookies(data.cookies);

        const ocrResult = await recognizeCaptcha(data.imageBase64);
        if (ocrResult) {
          ocrText = ocrResult.text;
          setCaptcha(ocrText);
        }
      } catch {}

      if (!ocrText) {
        setAutoLoginStatus("验证码识别失败，重试...");
        continue;
      }

      setAutoLoginStatus(`识别: ${ocrText}，提交中...`);

      try {
        if (rememberMe) saveCredentials(account, password);
        else clearCredentials();

        const sessionCookies = await loginViaProxy(account, password, ocrText, captchaCookies);
        setCookies(sessionCookies);

        const catResult = await getCategoriesViaProxy(sessionCookies);
        setCategories(catResult.categories);
        setCookies(catResult.cookies);

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
      const result = await getCoursesViaProxy(cookies, code);
      setCourses(result.courses);
      setCategoryUrl(result.categoryUrl);
      setCookies(result.cookies);
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
      /* 1. Calibrate time */
      logger({ type: "calibrating", message: "正在校准服务器时间..." });
      const timeDiff = await calibrateTimeViaProxy(cookies);
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
      const result = await enrollJobViaProxy(preferences, courses, categoryUrl, cookies, logger);

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
            </div>

            <label className={s.checkboxLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              记住我（下次自动识别验证码登录）
            </label>

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

            {/* Result banners */}
            {enrollDone && enrollSuccess && (
              <div className={s.successBanner}>选课成功!</div>
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
