"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import s from "./enroll.module.css";
import {
    fetchCaptchaViaProxy,
    loginViaProxy,
    cookieLoginViaProxy,
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

interface LogEntry {
    type: string;
    message: string;
    index?: number;
    course?: string;
}

type Step = "login" | "categories" | "courses" | "enroll";

// ─── Credential Storage (shared across all tools) ───────────
function saveCredentials(account: string, password: string) {
    try {
        localStorage.setItem("smu_account", account);
        localStorage.setItem("smu_password", btoa(password));
    } catch { /* ignore */ }
}

function loadCredentials(): { account: string; password: string } | null {
    try {
        const account = localStorage.getItem("smu_account");
        const pwd = localStorage.getItem("smu_password");
        if (account && pwd) return { account, password: atob(pwd) };
    } catch { /* ignore */ }
    return null;
}

function clearCredentials() {
    try {
        localStorage.removeItem("smu_account");
        localStorage.removeItem("smu_password");
    } catch { /* ignore */ }
}

export default function EnrollPage() {
    const [step, setStep] = useState<Step>("login");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Auth
    const [account, setAccount] = useState("");
    const [password, setPassword] = useState("");
    const [captcha, setCaptcha] = useState("");
    const [captchaImg, setCaptchaImg] = useState("");
    const [uisCookies, setUisCookies] = useState<string[]>([]);
    const [cookies, setCookies] = useState<string[]>([]);
    const [rememberMe, setRememberMe] = useState(false);
    const [loginMode, setLoginMode] = useState<"sso" | "cookie">("sso");
    const [cookieInput, setCookieInput] = useState("");

    // Auto-login state
    const [autoLoginStatus, setAutoLoginStatus] = useState("");
    const [ocrStatus, setOcrStatus] = useState("");
    const loadedFromStorage = useRef(false);
    const autoLoginAttempted = useRef(false);

    // Data
    const [categories, setCategories] = useState<CourseCategory[]>([]);
    const [courses, setCourses] = useState<CourseItem[]>([]);
    const [categoryUrl, setCategoryUrl] = useState("");

    // Preferences
    const [pref1, setPref1] = useState<string>("");
    const [pref2, setPref2] = useState<string>("");
    const [pref3, setPref3] = useState<string>("");
    const [pref4, setPref4] = useState<string>("");
    const [scheduledTime, setScheduledTime] = useState("13:00:00");

    // Log
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [enrollDone, setEnrollDone] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);

    // ─── Load saved credentials on mount ────────────────────────
    useEffect(() => {
        const creds = loadCredentials();
        if (creds) {
            setAccount(creds.account);
            setPassword(creds.password);
            setRememberMe(true);
            loadedFromStorage.current = true;
        }
    }, []);

    // ─── Captcha fetch + auto-OCR ───────────────────────────────
    const loadCaptcha = useCallback(async (): Promise<{
        imageBase64: string;
        cookies: string[];
        ocrText: string | null;
    } | null> => {
        try {
            const { imageBase64, cookies: caps } = await fetchCaptchaViaProxy();
            setCaptchaImg(imageBase64);
            setUisCookies(caps);

            // Always try OCR to auto-fill captcha input
            setOcrStatus("识别验证码中...");
            try {
                const ocrResult = await recognizeCaptcha(imageBase64);
                if (ocrResult) {
                    setCaptcha(ocrResult.text);
                    setOcrStatus(`已识别: ${ocrResult.text}`);
                    setTimeout(() => setOcrStatus(""), 2000);
                    return { imageBase64, cookies: caps, ocrText: ocrResult.text };
                }
            } catch (err) {
                console.error("[enroll] OCR error:", err);
            }

            setOcrStatus("自动识别失败，请手动输入");
            setTimeout(() => setOcrStatus(""), 3000);
            return { imageBase64, cookies: caps, ocrText: null };
        } catch (err) {
            console.error("[enroll] Captcha fetch error:", err);
            setError("获取验证码失败，请稍后重试");
            return null;
        }
    }, []);

    // Initial captcha load only
    useEffect(() => {
        loadCaptcha();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-login (triggered by button, not automatically)
    const handleAutoLogin = async () => {
        setLoading(true);
        setError("");
        setAutoLoginStatus("自动登录中...");
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            setAutoLoginStatus(`尝试自动登录 (${attempt}/${maxRetries})...`);
            const cap = await loadCaptcha();
            if (!cap?.ocrText) { setAutoLoginStatus(`验证码识别失败，重试...`); continue; }
            setAutoLoginStatus(`识别: ${cap.ocrText}，登录中...`);
            try {
                const zhjwCookies = await loginViaProxy(account, password, cap.ocrText, cap.cookies);
                setCookies(zhjwCookies);
                setAutoLoginStatus("登录成功，加载选课类型...");
                const { categories: cats, cookies: updatedCookies } = await getCategoriesViaProxy(zhjwCookies);
                setCookies(updatedCookies);
                setCategories(cats);
                setAutoLoginStatus("");
                setStep("categories");
                if (rememberMe) saveCredentials(account, password);
                else clearCredentials();
                setLoading(false);
                return;
            } catch (err) {
                const msg = err instanceof Error ? err.message : "登录失败";
                setAutoLoginStatus(`${msg}，重试...`);
            }
        }
        setAutoLoginStatus("");
        setError("自动登录未成功，请手动输入验证码");
        await loadCaptcha();
        setLoading(false);
    };

    // ─── Manual Login ───────────────────────────────────────────
    const handleLogin = async () => {
        setLoading(true);
        setError("");
        try {
            const zhjwCookies = await loginViaProxy(account, password, captcha, uisCookies);
            setCookies(zhjwCookies);

            if (rememberMe) saveCredentials(account, password);
            else clearCredentials();

            const { categories: cats, cookies: updatedCookies } =
                await getCategoriesViaProxy(zhjwCookies);
            setCookies(updatedCookies);
            setCategories(cats);
            setStep("categories");
        } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
            loadCaptcha();
            setCaptcha("");
        } finally {
            setLoading(false);
        }
    };

    // ─── Cookie Login ───────────────────────────────────────────
    const handleCookieLogin = async () => {
        setLoading(true);
        setError("");
        try {
            const zhjwCookies = await cookieLoginViaProxy(cookieInput);
            setCookies(zhjwCookies);

            const { categories: cats, cookies: updatedCookies } =
                await getCategoriesViaProxy(zhjwCookies);
            setCookies(updatedCookies);
            setCategories(cats);
            setStep("categories");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Cookie 登录失败");
        } finally {
            setLoading(false);
        }
    };

    // ─── Select Category ────────────────────────────────────────
    const handleSelectCategory = async (code: string) => {
        setLoading(true);
        setError("");
        try {
            const { courses: list, categoryUrl: catUrl, cookies: updatedCookies } =
                await getCoursesViaProxy(cookies, code);
            setCookies(updatedCookies);
            setCourses(list);
            setCategoryUrl(catUrl);
            setStep("courses");
        } catch (err) {
            setError(err instanceof Error ? err.message : "获取课程列表失败");
        } finally {
            setLoading(false);
        }
    };

    // ─── Start Enrollment (client-side) ─────────────────────────
    const handleEnroll = async () => {
        const preferences = [pref1, pref2, pref3, pref4].map((v) =>
            v ? parseInt(v, 10) : null,
        );

        if (!preferences[0]) {
            setError("请至少选择第一志愿");
            return;
        }

        setStep("enroll");
        setLogs([]);
        setEnrollDone(false);
        setError("");

        const logger: LogCallback = (event) => {
            setLogs((prev) => [...prev, event]);
        };

        try {
            // Step 1: Calibrate time
            logger({ type: "calibrating", message: "正在校准服务器时间..." });
            const timeDiff = await calibrateTimeViaProxy(cookies);
            logger({
                type: "calibrating",
                message: `时间校准完成，差值: ${(timeDiff / 1000).toFixed(3)}s`,
            });

            // Step 2: Wait for scheduled time
            if (scheduledTime) {
                const runAt = computeRunAt(scheduledTime, timeDiff);
                let waitMs = runAt - Date.now();

                if (waitMs > 0) {
                    logger({
                        type: "waiting",
                        message: `将在 ${scheduledTime} 开始，等待 ${(waitMs / 1000).toFixed(0)}s...`,
                    });
                    while (waitMs > 0) {
                        const sleepMs = Math.min(waitMs, 5000);
                        await new Promise((r) => setTimeout(r, sleepMs));
                        waitMs = runAt - Date.now();
                        if (waitMs > 0) {
                            logger({
                                type: "waiting",
                                message: `等待中... 剩余 ${(waitMs / 1000).toFixed(0)}s`,
                            });
                        }
                    }
                }
            }

            // Step 3: Enroll
            logger({ type: "info", message: "开始抢课！" });
            await enrollJobViaProxy(preferences, courses, categoryUrl, cookies, logger);
        } catch (err) {
            logger({
                type: "error",
                message: err instanceof Error ? err.message : "发生错误",
            });
        } finally {
            setEnrollDone(true);
        }
    };

    // Auto-scroll
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs]);

    const steps: Step[] = ["login", "categories", "courses", "enroll"];
    const currentIdx = steps.indexOf(step);

    return (
        <div className={s.enrollPage}>
            <div className={s.container}>
                <Link href="/" className={s.backLink}>
                    ← 返回首页
                </Link>

                <div className={s.header}>
                    <h1>⚡ 自动选课</h1>
                    <p>SMU 教务系统智能抢课工具</p>
                </div>

                <div className={s.stepIndicator}>
                    {steps.map((st, i) => (
                        <div
                            key={st}
                            className={`${s.stepDot} ${i === currentIdx ? s.active : ""} ${i < currentIdx ? s.done : ""}`}
                        />
                    ))}
                </div>

                {error && <div className={s.errorBanner}>❌ {error}</div>}

                {/* Step 1: Login */}
                {step === "login" && (
                    <div className={s.card}>
                        <h2>🔐 登录教务系统</h2>

                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                            <button
                                className={`${s.btn} ${loginMode === "sso" ? s.btnPrimary : s.btnSecondary}`}
                                onClick={() => setLoginMode("sso")}
                                style={{ flex: 1, padding: "0.5rem" }}
                            >
                                账号密码登录
                            </button>
                            <button
                                className={`${s.btn} ${loginMode === "cookie" ? s.btnPrimary : s.btnSecondary}`}
                                onClick={() => setLoginMode("cookie")}
                                style={{ flex: 1, padding: "0.5rem" }}
                            >
                                🍪 Cookie 登录
                            </button>
                        </div>

                        {loginMode === "sso" && (
                            <>
                                {autoLoginStatus && (
                                    <div className={s.autoLoginBanner}>
                                        <span className={s.spinner} /> {autoLoginStatus}
                                    </div>
                                )}

                                <div className={s.formGroup}>
                                    <label>学号</label>
                                    <input
                                        value={account}
                                        onChange={(e) => setAccount(e.target.value)}
                                        placeholder="请输入学号"
                                        autoComplete="username"
                                    />
                                </div>
                                <div className={s.formGroup}>
                                    <label>密码</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="请输入密码"
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div className={s.formGroup}>
                                    <label>验证码</label>
                                    <div className={s.captchaRow}>
                                        <input
                                            value={captcha}
                                            onChange={(e) => setCaptcha(e.target.value)}
                                            placeholder="输入验证码"
                                            onKeyDown={(e) =>
                                                e.key === "Enter" && handleLogin()
                                            }
                                        />
                                        {captchaImg && (
                                            <img
                                                src={captchaImg}
                                                alt="验证码"
                                                className={s.captchaImg}
                                                onClick={loadCaptcha}
                                                title="点击刷新"
                                            />
                                        )}
                                    </div>
                                    {ocrStatus && (
                                        <span style={{ fontSize: "0.75rem", color: "#8bb4ff", marginTop: "0.3rem", display: "block" }}>
                                            🤖 {ocrStatus}
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
                                    className={`${s.btn} ${s.btnPrimary}`}
                                    onClick={handleLogin}
                                    disabled={loading || !account || !password || !captcha}
                                >
                                    {loading ? "登录中..." : "登录"}
                                </button>

                                {account && password && (
                                    <button
                                        className={`${s.btn} ${s.btnSecondary}`}
                                        onClick={handleAutoLogin}
                                        disabled={loading}
                                        style={{ marginTop: "0.5rem" }}
                                    >
                                        {autoLoginStatus || "🤖 一键登录（自动识别验证码）"}
                                    </button>
                                )}
                            </>
                        )}

                        {loginMode === "cookie" && (
                            <>
                                <div style={{ fontSize: "0.8rem", color: "#8bb4ff", marginBottom: "0.8rem", lineHeight: 1.5 }}>
                                    💡 先在浏览器登录 <a href="https://zhjw.smu.edu.cn" target="_blank" rel="noreferrer" style={{ color: "#6ea8fe" }}>zhjw.smu.edu.cn</a>，
                                    然后复制 Cookie（按 F12 → 应用/Application → Cookies → 复制 JSESSIONID 的值）。
                                    <br />
                                    <strong>优势</strong>：复用浏览器会话，不会把浏览器踢下线。
                                </div>
                                <div className={s.formGroup}>
                                    <label>Cookie / JSESSIONID</label>
                                    <input
                                        value={cookieInput}
                                        onChange={(e) => setCookieInput(e.target.value)}
                                        placeholder="粘贴 JSESSIONID 值或完整 Cookie 字符串"
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleCookieLogin()
                                        }
                                    />
                                </div>
                                <button
                                    className={`${s.btn} ${s.btnPrimary}`}
                                    onClick={handleCookieLogin}
                                    disabled={loading || !cookieInput.trim()}
                                >
                                    {loading ? "验证中..." : "🍪 Cookie 登录"}
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Step 2: Categories */}
                {step === "categories" && (
                    <div className={s.card}>
                        <h2>📋 选择课程类型</h2>
                        {loading ? (
                            <p>加载中...</p>
                        ) : (
                            <ul className={s.categoryList}>
                                {categories.map((cat) => (
                                    <li
                                        key={cat.code}
                                        className={s.categoryItem}
                                        onClick={() => handleSelectCategory(cat.code)}
                                    >
                                        <span>{cat.title}</span>
                                        <span className="code">#{cat.code}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => setStep("login")}
                            style={{ marginTop: "1rem" }}
                        >
                            ← 返回上一步
                        </button>
                    </div>
                )}

                {/* Step 3: Courses */}
                {step === "courses" && (
                    <div className={s.card}>
                        <h2>📚 选择志愿 ({courses.length} 门课程)</h2>

                        <div className={s.courseTableWrap}>
                            <table className={s.courseTable}>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>课程名</th>
                                        <th>教师</th>
                                        <th>人数</th>
                                        <th>学分</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {courses.map((c, i) => (
                                        <tr key={c.kcrwdm}>
                                            <td>{i + 1}</td>
                                            <td>{c.kcmc}</td>
                                            <td>{c.teaxm}</td>
                                            <td>{c.pkrs}/{c.xkrs}</td>
                                            <td>{c.xf}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={s.prefRow}>
                            <div className={s.formGroup}>
                                <label>第一志愿 *</label>
                                <select value={pref1} onChange={(e) => setPref1(e.target.value)}>
                                    <option value="">请选择</option>
                                    {courses.map((c, i) => (
                                        <option key={c.kcrwdm} value={i + 1}>
                                            {i + 1}. {c.kcmc}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={s.formGroup}>
                                <label>第二志愿</label>
                                <select value={pref2} onChange={(e) => setPref2(e.target.value)}>
                                    <option value="">留空</option>
                                    {courses.map((c, i) => (
                                        <option key={c.kcrwdm} value={i + 1}>
                                            {i + 1}. {c.kcmc}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className={s.prefRow}>
                            <div className={s.formGroup}>
                                <label>第三志愿</label>
                                <select value={pref3} onChange={(e) => setPref3(e.target.value)}>
                                    <option value="">留空</option>
                                    {courses.map((c, i) => (
                                        <option key={c.kcrwdm} value={i + 1}>
                                            {i + 1}. {c.kcmc}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={s.formGroup}>
                                <label>第四志愿</label>
                                <select value={pref4} onChange={(e) => setPref4(e.target.value)}>
                                    <option value="">留空</option>
                                    {courses.map((c, i) => (
                                        <option key={c.kcrwdm} value={i + 1}>
                                            {i + 1}. {c.kcmc}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={s.formGroup}>
                            <label>开始时间（北京时间 UTC+8，留空立即开始）</label>
                            <input
                                value={scheduledTime}
                                onChange={(e) => setScheduledTime(e.target.value)}
                                placeholder="13:00:00"
                            />
                            <span style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.3rem", display: "block" }}>
                                💡 输入你本地的北京时间即可，系统会自动校准与美西服务器的时间差
                            </span>
                        </div>

                        <button
                            className={`${s.btn} ${s.btnPrimary}`}
                            onClick={handleEnroll}
                            disabled={!pref1}
                        >
                            🚀 开始抢课
                        </button>
                        <button
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => setStep("categories")}
                            style={{ marginTop: "0.5rem" }}
                        >
                            ← 返回上一步
                        </button>
                    </div>
                )}

                {/* Step 4: Log */}
                {step === "enroll" && (
                    <div className={s.card}>
                        <h2>
                            {enrollDone
                                ? logs.some((l) => l.type === "success")
                                    ? "✅ 选课完成"
                                    : "❌ 选课结束"
                                : "⚡ 抢课进行中..."}
                        </h2>

                        {enrollDone && logs.some((l) => l.type === "success") && (
                            <div className={s.successBanner}>
                                🎉 {logs.find((l) => l.type === "success")?.message}
                            </div>
                        )}

                        <div className={s.logConsole} ref={logRef}>
                            {logs.map((log, i) => (
                                <p
                                    key={i}
                                    className={`${s.logLine} ${s[log.type] || ""}`}
                                >
                                    {log.message}
                                </p>
                            ))}
                            {!enrollDone && (
                                <p className={s.logLine} style={{ opacity: 0.5 }}>
                                    ▌
                                </p>
                            )}
                        </div>

                        {enrollDone && (
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={() => setStep("courses")}
                                style={{ marginTop: "1rem" }}
                            >
                                ← 返回选择志愿
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
