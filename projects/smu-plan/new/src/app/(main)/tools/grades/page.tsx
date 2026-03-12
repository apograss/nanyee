"use client";

import { useState, useCallback, useEffect, FormEvent } from "react";
import Link from "next/link";
import OcrFeedbackPrompt from "@/components/molecules/OcrFeedbackPrompt";
import { recognizeCaptcha } from "@/lib/captcha-ocr";
import s from "../tools.module.css";

// ─── Credential Helpers ──────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────

function getGradeClass(score: number): string {
  if (score >= 90) return s.gradeExcellent;
  if (score >= 80) return s.gradeGood;
  if (score >= 70) return s.gradeOk;
  if (score >= 60) return s.gradePass;
  return s.gradeFail;
}

function getGradeColor(score: number): string {
  if (score >= 90) return "var(--success)";
  if (score >= 80) return "var(--brand)";
  if (score >= 70) return "var(--warning, #f59e0b)";
  if (score >= 60) return "var(--text-muted)";
  return "var(--error)";
}

function getPercentile(rank: number, total: number): string {
  if (!total) return "-";
  return ((rank / total) * 100).toFixed(1);
}

// ─── Component ───────────────────────────────────────────────

export default function GradesPage() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [autoLoginStatus, setAutoLoginStatus] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeSummary | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // ─── Captcha Loading ────────────────────────────────────────

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
      } catch {
        setOcrStatus("");
      }
    } catch {
      setCaptchaImage("");
      setSessionId("");
    }
    setCaptchaLoading(false);
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  // ─── Manual Submit ──────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account || !password || !captcha || !sessionId) return;

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

  // ─── Auto-Login (3 OCR Retries) ─────────────────────────────

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
      } catch {
        /* ignore */
      }
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
          body: JSON.stringify({
            sessionId: sid,
            account,
            password,
            captcha: ocrText,
          }),
        });
        const data = await res.json();

        if (data.error) {
          setAutoLoginStatus(`${data.error}，重试...`);
          continue;
        }

        setResult(data);
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

  // ─── Filtering ──────────────────────────────────────────────

  const filteredGrades = result?.grades.filter((g) => {
    if (filter === "all") return true;
    if (filter === "required") return g.xdfsmc === "必修";
    if (filter === "elective") return g.xdfsmc !== "必修";
    return g.xnxqmc === filter;
  });

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className={s.toolLayout}>
      <div className={result ? s.containerWide : s.container}>
        {/* Header */}
        <div className={s.header}>
          <div className={s.logo}>
            Nanyee<span className={s.logoAccent}>.de</span>
          </div>
          <div className={s.subtitle}>📊 成绩查询 &amp; 排名分析</div>
        </div>

        {/* Login Form — hidden after results load */}
        {!result && (
          <div className={s.card}>
            <form onSubmit={handleSubmit}>
              <div className={s.formGroup}>
                <label className={s.label} htmlFor="g-account">
                  学号
                </label>
                <input
                  id="g-account"
                  className={s.input}
                  type="text"
                  placeholder="请输入教务系统学号"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className={s.formGroup}>
                <label className={s.label} htmlFor="g-password">
                  密码
                </label>
                <input
                  id="g-password"
                  className={s.input}
                  type="password"
                  placeholder="教务系统密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className={s.formGroup}>
                <label className={s.label}>验证码</label>
                <div className={s.captchaRow}>
                  <input
                    className={s.input}
                    type="text"
                    placeholder="输入右图数字"
                    value={captcha}
                    onChange={(e) => setCaptcha(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <div
                    className={s.captchaBox}
                    onClick={loadCaptcha}
                    title="点击刷新验证码"
                  >
                    {captchaLoading ? (
                      <span className={s.captchaPlaceholder}>加载中...</span>
                    ) : captchaImage ? (
                      <img src={captchaImage} alt="验证码" />
                    ) : (
                      <span className={s.captchaPlaceholder}>点击获取</span>
                    )}
                  </div>
                </div>
                {ocrStatus && (
                  <span className={s.ocrStatus}>🤖 {ocrStatus}</span>
                )}
                {captchaImage ? (
                  <OcrFeedbackPrompt
                    imageBase64={captchaImage}
                    correctedText={captcha}
                    sourcePage="grades"
                  />
                ) : null}
              </div>

              <button
                type="submit"
                className={s.submitBtn}
                disabled={loading || !account || !password || !captcha}
              >
                {loading ? (
                  <span className={s.loading}>
                    <span className={s.spinner} />
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
              className={s.secondaryBtn}
              style={{ marginTop: "0.5rem" }}
              disabled={loading || !account || !password}
              onClick={handleAutoLogin}
            >
              {autoLoginStatus ? (
                <span className={s.loading}>
                  <span className={s.spinner} />
                  {autoLoginStatus}
                </span>
              ) : (
                "🤖 一键查询（自动识别验证码）"
              )}
            </button>

            <div className={s.privacyNote}>
              🔒 你的密码仅用于登录教务系统，不会被存储。
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={s.result}>
            <div className={`${s.resultCard} ${s.resultError}`}>
              <div className={s.resultTitle}>❌ 查询失败</div>
              <p className={s.errorText}>{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* GPA Summary Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div
                className={s.card}
                style={{ padding: "1rem", textAlign: "center" }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  加权 GPA
                </div>
                <div
                  style={{
                    fontSize: "1.8rem",
                    fontWeight: 700,
                    color: "var(--brand)",
                    marginTop: "0.25rem",
                  }}
                >
                  {result.weightedGpa.toFixed(2)}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-muted)",
                    marginTop: "0.15rem",
                  }}
                >
                  必修 {result.requiredGpa.toFixed(2)}
                </div>
              </div>
              <div
                className={s.card}
                style={{ padding: "1rem", textAlign: "center" }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  加权均分
                </div>
                <div
                  style={{
                    fontSize: "1.8rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginTop: "0.25rem",
                  }}
                >
                  {result.averageScore.toFixed(1)}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-muted)",
                    marginTop: "0.15rem",
                  }}
                >
                  {result.totalCourses} 门 · {result.totalCredits} 学分
                  {result.failedCount > 0 && (
                    <span style={{ color: "var(--error)" }}>
                      {" "}
                      · {result.failedCount} 不及格
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter Chips */}
            <div className={s.filterChips}>
              {["all", "required", "elective", ...result.semesters].map(
                (f) => (
                  <button
                    key={f}
                    className={`${s.filterChip} ${filter === f ? s.filterChipActive : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === "all"
                      ? "全部"
                      : f === "required"
                        ? "必修"
                        : f === "elective"
                          ? "选修"
                          : f}
                  </button>
                ),
              )}
            </div>

            {/* Grade Cards */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              {filteredGrades?.map((g) => (
                <div
                  key={g.cjdm}
                  className={`${s.card} ${getGradeClass(g.zcjfs)}`}
                  style={{ padding: "0.9rem 1rem" }}
                >
                  {/* Course name + score row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.9rem",
                          marginBottom: "0.2rem",
                        }}
                      >
                        {g.kcmc}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {g.xdfsmc} · {g.kcdlmc} · {g.xf}学分 · {g.kkbmmc}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: "1.3rem",
                          fontWeight: 700,
                          color: getGradeColor(g.zcjfs),
                        }}
                      >
                        {g.zcj}
                      </div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        绩点 {g.cjjd}
                      </div>
                    </div>
                  </div>

                  {/* Ranking section */}
                  {g.ranking && (
                    <div
                      style={{
                        marginTop: "0.6rem",
                        paddingTop: "0.6rem",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        gap: "1rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>
                          课程排名{" "}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {g.ranking.courseRank}/{g.ranking.courseTotal}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {" "}
                          (前{" "}
                          {getPercentile(
                            g.ranking.courseRank,
                            g.ranking.courseTotal,
                          )}
                          %)
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>
                          班级排名{" "}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {g.ranking.classRank}/{g.ranking.classTotal}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Back / re-query button */}
            <button
              className={s.secondaryBtn}
              style={{ marginTop: "1.5rem" }}
              onClick={() => {
                setResult(null);
                setError("");
                setFilter("all");
                loadCaptcha();
              }}
            >
              🔄 重新查询
            </button>
          </>
        )}

        {/* Footer */}
        <div className={s.footer}>
          <Link href="/tools/schedule">📅 课表导出</Link>
          {" · "}
          <Link href="/tools/enroll">⚡ 自动选课</Link>
          {" · "}
          <Link href="/">Nanyee.de</Link>
        </div>
      </div>
    </div>
  );
}
