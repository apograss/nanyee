"use client";

import { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import Link from "next/link";
import { recognizeCaptcha } from "@/lib/captcha-ocr";

function saveCredentials(a: string, p: string) { try { localStorage.setItem("smu_account", a); localStorage.setItem("smu_password", btoa(p)); } catch { } }
function loadSavedCredentials(): { account: string; password: string } | null { try { const a = localStorage.getItem("smu_account"); const p = localStorage.getItem("smu_password"); if (a && p) return { account: a, password: atob(p) }; } catch { } return null; }
function clearCredentials() { try { localStorage.removeItem("smu_account"); localStorage.removeItem("smu_password"); } catch { } }

interface RankingInfo {
    courseRank: number;
    courseTotal: number;
    classRank: number;
    classTotal: number;
    distribution: {
        lt60: number;
        s60to70: number;
        s70to80: number;
        s80to90: number;
        gte90: number;
    };
}

interface GradeRecord {
    kcmc: string;
    kcywmc: string;
    zcj: string;
    zcjfs: number;
    cjjd: number;
    xf: number;
    xdfsmc: string;
    kcdlmc: string;
    kcflmc: string;
    xnxqmc: string;
    cjfsmc: string;
    kkbmmc: string;
    ksxzmc: string;
    cjdm: string;
    zxs: number;
    ranking?: RankingInfo;
}

interface GradeSummary {
    totalCredits: number;
    totalCourses: number;
    weightedGpa: number;
    requiredGpa: number;
    averageScore: number;
    requiredAverageScore: number;
    failedCount: number;
    grades: GradeRecord[];
    semesters: string[];
}

function getGradeColor(score: number): string {
    if (score >= 90) return "var(--success)";
    if (score >= 80) return "var(--accent-light)";
    if (score >= 70) return "var(--warning)";
    if (score >= 60) return "var(--text-dim)";
    return "var(--error)";
}

function getPercentile(rank: number, total: number): string {
    if (!total) return "-";
    return ((rank / total) * 100).toFixed(1);
}

export default function GradesPage() {
    const [account, setAccount] = useState("");
    const [password, setPassword] = useState("");
    const [captcha, setCaptcha] = useState("");
    const [captchaImage, setCaptchaImage] = useState("");
    const [sessionId, setSessionId] = useState("");
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [ocrStatus, setOcrStatus] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [autoLoginStatus, setAutoLoginStatus] = useState("");
    const loadedFromStorage = useRef(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GradeSummary | null>(null);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        const creds = loadSavedCredentials();
        if (creds) {
            setAccount(creds.account);
            setPassword(creds.password);
            setRememberMe(true);
            loadedFromStorage.current = true;
        }
    }, []);

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

    useEffect(() => {
        loadCaptcha();
    }, [loadCaptcha]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!account || !password || !captcha || !sessionId) return;

        if (rememberMe) saveCredentials(account, password);
        else clearCredentials();

        setLoading(true);
        setResult(null);
        setError("");

        try {
            const res = await fetch("/api/tools/grades", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, account, password, captcha }),
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
                loadCaptcha();
            } else {
                setResult(data);
            }
        } catch {
            setError("网络错误，请检查连接后重试");
            loadCaptcha();
        }
        setLoading(false);
    };

    // ─── Auto-Login (3 captcha retries) ─────────────────────────
    const handleAutoLogin = async () => {
        if (!account || !password) return;
        setLoading(true);
        setResult(null);
        setError("");
        setAutoLoginStatus("自动登录中...");

        for (let attempt = 1; attempt <= 3; attempt++) {
            setAutoLoginStatus(`尝试自动登录 (${attempt}/3)...`);
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

            setAutoLoginStatus(`识别: ${ocrText}，查询中...`);
            try {
                const res = await fetch("/api/tools/grades", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: sid, account, password, captcha: ocrText }),
                });
                const data = await res.json();

                if (data.error) {
                    setAutoLoginStatus(`${data.error}，重试...`);
                    continue;
                }

                setResult(data);
                if (rememberMe) saveCredentials(account, password);
                else clearCredentials();
                setAutoLoginStatus("");
                setLoading(false);
                return;
            } catch {
                setAutoLoginStatus("网络错误，重试...");
            }
        }

        setAutoLoginStatus("");
        setError("自动登录未成功，请手动输入验证码");
        loadCaptcha();
        setLoading(false);
    };

    const filteredGrades = result?.grades.filter((g) => {
        if (filter === "all") return true;
        if (filter === "required") return g.xdfsmc === "必修";
        if (filter === "elective") return g.xdfsmc !== "必修";
        return g.xnxqmc === filter;
    });

    return (
        <div className="page">
            <div className="container" style={{ maxWidth: result ? 640 : 460 }}>
                {/* Header */}
                <div className="header">
                    <div className="logo">
                        nanyee<span>.de</span>
                    </div>
                    <div className="subtitle">📊 成绩查询 & 排名分析</div>
                    <div style={{ marginTop: "0.5rem" }}>
                        <Link
                            href="/"
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                textDecoration: "none",
                            }}
                        >
                            ← 返回课表导出
                        </Link>
                    </div>
                </div>

                {/* Login Form (hide after result) */}
                {!result && (
                    <div className="card">
                        <form onSubmit={handleSubmit}>
                            <div className="formGroup">
                                <label className="label" htmlFor="g-account">学号</label>
                                <input
                                    id="g-account"
                                    className="input"
                                    type="text"
                                    placeholder="请输入教务系统学号"
                                    value={account}
                                    onChange={(e) => setAccount(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="formGroup">
                                <label className="label" htmlFor="g-password">密码</label>
                                <input
                                    id="g-password"
                                    className="input"
                                    type="password"
                                    placeholder="教务系统密码"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
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
                                    <div className="captchaBox" onClick={loadCaptcha} title="点击刷新验证码">
                                        {captchaLoading ? (
                                            <span className="captchaPlaceholder">加载中...</span>
                                        ) : captchaImage ? (
                                            <img src={captchaImage} alt="验证码" />
                                        ) : (
                                            <span className="captchaPlaceholder">点击获取</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="submitBtn"
                                disabled={loading || !account || !password || !captcha}
                            >
                                {loading ? (
                                    <span className="loading">
                                        <span className="spinner" />
                                        {autoLoginStatus || "正在查询成绩和排名，请稍等..."}
                                    </span>
                                ) : (
                                    "📊 查询成绩"
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
                                "🤖 一键查询（自动识别验证码）"
                            )}
                        </button>
                        <div className="privacyNote">
                            🔒 你的密码仅用于登录教务系统，不会被存储。
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="result">
                        <div className="resultCard resultError">
                            <div className="resultTitle">❌ 查询失败</div>
                            <p className="errorText">{error}</p>
                        </div>
                    </div>
                )}

                {/* Results */}
                {result && (
                    <>
                        {/* Summary Cards */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                            <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    加权 GPA
                                </div>
                                <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--accent-light)", marginTop: "0.25rem" }}>
                                    {result.weightedGpa.toFixed(2)}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                    必修 {result.requiredGpa.toFixed(2)}
                                </div>
                            </div>
                            <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    加权均分
                                </div>
                                <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--text)", marginTop: "0.25rem" }}>
                                    {result.averageScore.toFixed(1)}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                                    {result.totalCourses} 门 · {result.totalCredits} 学分
                                    {result.failedCount > 0 && (
                                        <span style={{ color: "var(--error)" }}> · {result.failedCount} 不及格</span>
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
                            记住我
                        </label>

                        {/* Filter */}
                        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                            {["all", "required", "elective", ...result.semesters].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    style={{
                                        padding: "0.35rem 0.75rem",
                                        fontSize: "0.75rem",
                                        borderRadius: "var(--radius-sm)",
                                        border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
                                        background: filter === f ? "var(--accent-glow)" : "var(--bg-input)",
                                        color: filter === f ? "var(--accent-light)" : "var(--text-dim)",
                                        cursor: "pointer",
                                        fontFamily: "var(--font)",
                                    }}
                                >
                                    {f === "all" ? "全部" : f === "required" ? "必修" : f === "elective" ? "选修" : f}
                                </button>
                            ))}
                        </div>

                        {/* Grade Cards */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            {filteredGrades?.map((g) => (
                                <div
                                    key={g.cjdm}
                                    className="card"
                                    style={{
                                        padding: "0.9rem 1rem",
                                        borderLeft: `3px solid ${getGradeColor(g.zcjfs)}`,
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                                                {g.kcmc}
                                            </div>
                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                {g.xdfsmc} · {g.kcdlmc} · {g.xf}学分 · {g.kkbmmc}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: getGradeColor(g.zcjfs) }}>
                                                {g.zcj}
                                            </div>
                                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                绩点 {g.cjjd}
                                            </div>
                                        </div>
                                    </div>
                                    {g.ranking && (
                                        <div style={{
                                            marginTop: "0.6rem",
                                            paddingTop: "0.6rem",
                                            borderTop: "1px solid var(--border)",
                                            display: "flex",
                                            gap: "1rem",
                                            fontSize: "0.75rem",
                                        }}>
                                            <div>
                                                <span style={{ color: "var(--text-muted)" }}>课程排名 </span>
                                                <span style={{ fontWeight: 600 }}>
                                                    {g.ranking.courseRank}/{g.ranking.courseTotal}
                                                </span>
                                                <span style={{ color: "var(--text-muted)" }}>
                                                    {" "}(前 {getPercentile(g.ranking.courseRank, g.ranking.courseTotal)}%)
                                                </span>
                                            </div>
                                            <div>
                                                <span style={{ color: "var(--text-muted)" }}>班级排名 </span>
                                                <span style={{ fontWeight: 600 }}>
                                                    {g.ranking.classRank}/{g.ranking.classTotal}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Back button */}
                        <button
                            className="submitBtn"
                            style={{ marginTop: "1.5rem", background: "var(--bg-input)", border: "1px solid var(--border)" }}
                            onClick={() => {
                                setResult(null);
                                setError("");
                                loadCaptcha();
                            }}
                        >
                            🔄 重新查询
                        </button>
                    </>
                )}

                {/* Footer */}
                <div className="footer">
                    <Link href="/" style={{ color: "var(--text-dim)", textDecoration: "none" }}>
                        📅 课表导出
                    </Link>
                    {" · "}
                    <a href="https://nanyee.de">nanyee.de</a>
                </div>
            </div>
        </div>
    );
}
