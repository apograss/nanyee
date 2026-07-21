// Canvas design runtime editable source marker: api-layer
// Nanyee API 集成层：CSRF / 401 / Turnstile / anti_abuse_pass / 敏感态内存生命周期
// 严格遵循 docs/frontend-integration.md 契约
//
// 说明：设计预览阶段后端未必运行，故提供 mock 数据驱动 UI 展示完整交互状态；
// 真实 apiFetch 封装已按契约实现（credentials:include、X-CSRF-Token、统一错误解析）。
import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

export const API_BASE = "/api/v1";

/* ---------- 敏感态清单（只内存，不持久化） ---------- */
// flow_id / academic_session_id / anti_abuse_pass / turnstile_token /
// 学校密码 / 学校验证码 / 邮箱验证码 / 托管凭证明文 / 带个人数据的完整响应
const SENSITIVE_KEYS = new Set([
  "password", "secret", "auth_token", "captcha", "code", "flow_id",
  "academic_session_id", "anti_abuse_pass", "turnstile_token",
]);

export function sanitizeForReport(payload) {
  // 错误上报前脱敏：递归清空敏感字段，只保留结构
  if (!payload || typeof payload !== "object") return "[redacted]";
  if (Array.isArray(payload)) return `[array len=${payload.length}]`;
  const out = {};
  for (const k of Object.keys(payload)) {
    out[k] = SENSITIVE_KEYS.has(k) || /password|secret|token|cookie|session|authorization/i.test(k)
      ? "[redacted]"
      : typeof payload[k] === "object" ? sanitizeForReport(payload[k]) : payload[k];
  }
  return out;
}

/* ---------- CSRF：从 nanyee_csrf Cookie 读，写请求注入 ---------- */
export function getCsrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)nanyee_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function isWriteMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

/* ---------- 统一错误结构 ---------- */
// { error: { code, message, request_id, retryable, details } }
export class ApiError extends Error {
  constructor(payload, status) {
    const e = payload?.error || {};
    super(e.message || `请求失败（${status}）`);
    this.code = e.code || "UNKNOWN";
    this.status = status;
    this.requestId = e.request_id || "";
    this.retryable = !!e.retryable;
    this.details = e.details || {};
    this.name = "ApiError";
  }
}

/* ---------- anti_abuse_pass：内存 + action 绑定 + 5min ---------- */
// 按 action 存，不跨 action，不持久化
const antiAbusePass = new Map(); // action -> { value, expiresAt }
export function getAntiAbusePass(action) {
  const e = antiAbusePass.get(action);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { antiAbusePass.delete(action); return null; }
  return e.value;
}
export function setAntiAbusePass(action, value, expiresIn = 300) {
  antiAbusePass.set(action, { value, expiresAt: Date.now() + expiresIn * 1000 });
}
function clearAntiAbusePass(action) { antiAbusePass.delete(action); }

/* ---------- Turnstile：按需加载 ---------- */
// 正常流量不加载；仅 RATE_LIMIT_CHALLENGE_REQUIRED 时用 sitekey + action 取 Token
let turnstileScriptLoaded = false;
function ensureTurnstileScript() {
  if (turnstileScriptLoaded || document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
    turnstileScriptLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__tsCb";
    s.async = true;
    s.defer = true;
    window.__tsCb = () => resolve();
    s.onerror = () => reject(new Error("Turnstile 脚本加载失败"));
    document.head.appendChild(s);
    turnstileScriptLoaded = true;
  });
}

/* ---------- Auth Context ---------- */
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // 平台用户态（非敏感）
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // 设计预览：后端未起时用 mock user
      const u = await apiGet("/auth/me", { mock: mockUser });
      setUser(u);
      return u;
    } catch (err) {
      if (err.code === "AUTHENTICATION_REQUIRED") {
        setUser(null);
        return null;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const value = useMemo(() => ({
    user, loading, refresh,
    setUser,
    clearOnExit: () => setUser(null), // 401 时清理内存态
  }), [user, loading, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}

/* ---------- 核心 fetch 封装 ---------- */
// options:
//   method, body, headers, mock(设计预览用 mock 数据), action(用于 Turnstile),
//   turnstileToken(已取到的 token), antiAbusePass(已取到的 pass)
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, headers = {}, mock, action } = options;
  // 设计预览：后端不可达时直接返回 mock
  if (mock !== undefined && !window.__NANYEE_LIVE__) {
    await new Promise((r) => setTimeout(r, 280));
    return mock;
  }
  const opts = {
    method,
    credentials: "include",
    headers: { ...headers },
  };
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  if (isWriteMethod(method)) {
    const csrf = getCsrfToken();
    if (csrf) opts.headers["X-CSRF-Token"] = csrf;
  }
  // 注入 anti_abuse_pass（同 action）
  if (action) {
    const pass = getAntiAbusePass(action);
    if (pass) opts.headers["anti-abuse-pass"] = pass;
  }
  // 注入 turnstile_token（调用方已通过 useTurnstile 取到）
  if (options.turnstileToken) opts.headers["turnstile-token"] = options.turnstileToken;

  const resp = await fetch(API_BASE + path, opts);
  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const err = new ApiError(isJson ? data : undefined, resp.status);
    // 401：清理内存用户态，跳登录
    if (err.code === "AUTHENTICATION_REQUIRED") {
      window.dispatchEvent(new CustomEvent("nanyee:unauth"));
    }
    // RATE_LIMIT_CHALLENGE_REQUIRED：交给 useTurnstile 处理
    if (err.code === "RATE_LIMIT_CHALLENGE_REQUIRED") {
      err.turnstileChallenge = {
        provider: err.details.provider,
        sitekey: err.details.sitekey,
        action: err.details.action,
      };
    }
    // 上游返回 anti_abuse_pass：内存缓存
    if (err.details?.anti_abuse_pass && err.details?.anti_abuse_pass_expires_in && action) {
      setAntiAbusePass(action, err.details.anti_abuse_pass, err.details.anti_abuse_pass_expires_in);
    }
    throw err;
  }
  return data;
}

export function apiGet(path, opts) { return apiFetch(path, { ...opts, method: "GET" }); }
export function apiPost(path, body, opts) { return apiFetch(path, { ...opts, method: "POST", body }); }
export function apiDelete(path, opts) { return apiFetch(path, { ...opts, method: "DELETE" }); }

/* ---------- Turnstile hook（按需加载） ---------- */
// 用法：const { ensureToken, reset, widgetProps } = useTurnstile();
// 仅在捕获 RATE_LIMIT_CHALLENGE_REQUIRED 后调用 ensureToken(action, sitekey)
export function useTurnstile() {
  const [challenge, setChallenge] = useState(null); // { sitekey, action }
  const [token, setToken] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(0);
  const [error, setError] = useState(null);
  const widgetIdRef = useRef(null);
  const containerRef = useRef(null);

  const reset = useCallback(() => {
    if (widgetIdRef.current !== null && window.turnstile) {
      try { window.turnstile.reset(widgetIdRef.current); } catch {}
    }
    setToken(null);
    setTokenExpiresAt(0);
    setError(null);
  }, []);

  const ensureToken = useCallback(async (action, sitekey) => {
    setError(null);
    if (token && Date.now() < tokenExpiresAt) return token;
    setChallenge({ sitekey, action });
    await ensureTurnstileScript();
    return new Promise((resolve, reject) => {
      const tryRender = () => {
        if (!window.turnstile) { setTimeout(tryRender, 60); return; }
        if (widgetIdRef.current !== null) {
          try { window.turnstile.remove(widgetIdRef.current); } catch {}
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          action,
          "feedback-enabled": false,
          callback: (t) => { setToken(t); setTokenExpiresAt(Date.now() + 4.5 * 60 * 1000); resolve(t); },
          "error-callback": () => { setError("verification_failed"); reject(new Error("Turnstile 校验失败，已重置")); },
          "expired-callback": () => { setToken(null); setTokenExpiresAt(0); },
        });
      };
      tryRender();
    });
  }, [token, tokenExpiresAt]);

  // 重放请求：用新 token 调原 apiFetch
  const replayWithChallenge = useCallback(async (runFn, action, sitekey) => {
    const t = await ensureToken(action, sitekey);
    try {
      return await runFn(t);
    } catch (err) {
      if (err.code === "HUMAN_VERIFICATION_FAILED") {
        reset();
        throw err;
      }
      throw err;
    }
  }, [ensureToken, reset]);

  const widget = challenge ? (
    <div ref={containerRef} className="turnstile-slot" aria-label="人机验证" />
  ) : null;

  return { challenge, token, error, ensureToken, reset, replayWithChallenge, widget };
}

/* ---------- 持久任务状态机 ---------- */
export const JOB_STATES = ["queued", "running", "retry_wait", "succeeded", "failed", "cancelled", "verification_required"];
export const TERMINAL_STATES = ["succeeded", "failed", "cancelled"];
export function isRetryableState(s) { return s === "queued" || s === "running" || s === "retry_wait"; }

/* ---------- 自动选课运行状态机 ---------- */
export const ENROLLMENT_RUN_STATES = ["calibrating", "waiting", "running", "succeeded", "failed", "cancelled"];
export const ENROLLMENT_TERMINAL_STATES = ["succeeded", "failed", "cancelled"];

/* ---------- 凭证用途与上游映射 ---------- */
export const CREDENTIAL_PURPOSES = [
  { purpose: "evaluation", upstream: "academic", label: "自动评课", secretType: "school_account" },
  { purpose: "study_cabin", upstream: "infospace", label: "自习室预约", secretType: "school_account" },
  { purpose: "qun_checkin", upstream: "qun100", label: "群报数", secretType: "qun_token" },
];

/* ---------- 确认版本常量 ---------- */
export const CONFIRMATION_VERSIONS = {
  enrollmentRun: "course_selection:auto_enroll:v1",
  evaluationJob: "evaluation:submit:v1",
  studyCabinJob: "study_cabin:reserve:v1",
  qunSubmit: "qun_checkin:submit:v1",
  wakeupShare: "timetable:wakeup_share:v1",
  credentialHosting: "credential-hosting-v1",
};

/* ---------- API 端点封装 ---------- */
// 选课
export function fetchEnrollmentCategories(academicSessionId, opts) {
  return apiPost("/smu/enrollment/categories", { academic_session_id: academicSessionId }, opts);
}
export function fetchEnrollmentCourses(academicSessionId, categoryCode, opts) {
  return apiPost("/smu/enrollment/courses", { academic_session_id: academicSessionId, category_code: categoryCode }, opts);
}
export function startEnrollmentRun(body, opts) {
  return apiPost("/smu/enrollment/runs", body, opts);
}
export function getEnrollmentRun(runId, opts) {
  return apiGet(`/smu/enrollment/runs/${runId}`, opts);
}
export function cancelEnrollmentRun(runId, opts) {
  return apiPost(`/smu/enrollment/runs/${runId}/cancel`, undefined, opts);
}

// 课表 WakeUp 分享
export function shareWakeup(body, opts) {
  return apiPost("/smu/timetable.wakeup.share", body, opts);
}

// 自习室舱位列表
export function fetchStudyCabins(opts) {
  return apiGet("/study-cabin/cabins", opts);
}

// 工具定义
export function fetchTools(opts) {
  return apiGet("/tools", opts);
}

// 凭证
export function createCredential(body, opts) {
  return apiPost("/credentials", body, opts);
}
export function listCredentials(opts) {
  return apiGet("/credentials", opts);
}
export function revokeCredential(id, opts) {
  return apiDelete(`/credentials/${id}`, opts);
}

// 任务
export function createJob(body, opts) {
  return apiFetch("/jobs", { ...opts, method: "POST", body, headers: { ...(opts?.headers || {}), "Idempotency-Key": opts?.idempotencyKey || crypto.randomUUID() } });
}
export function listJobs(opts) {
  return apiGet("/jobs", opts);
}
export function getJob(id, opts) {
  return apiGet(`/jobs/${id}`, opts);
}
export function cancelJob(id, opts) {
  return apiPost(`/jobs/${id}/cancel`, undefined, opts);
}

/* ---------- 设计预览 mock 数据 ---------- */
export const mockUser = {
  id: "usr_2c7f9a", username: "linyi", nickname: "林一", role: "student",
  status: "active", registration_trust_level: "community_quiz",
};

export const mockEnrollmentCategories = [
  { code: "12", title: "公共选修课" },
  { code: "05", title: "专业基础课" },
  { code: "21", title: "通识核心课" },
  { code: "08", title: "体育课程" },
];

export const mockEnrollmentCourses = [
  { task_code: "TC0001", name: "大学生心理健康", capacity: 200, selected_count: 156, credits: 2, department: "心理系", hours: 32, location: "教A-301", schedule: "周二 3-4节 1-16周", teacher: "王老师" },
  { task_code: "TC0002", name: "中国近现代史纲要", capacity: 150, selected_count: 148, credits: 3, department: "马院", hours: 48, location: "教B-201", schedule: "周四 1-2节 1-16周", teacher: "李老师" },
  { task_code: "TC0003", name: "人工智能导论", capacity: 80, selected_count: 79, credits: 2, department: "计算机学院", hours: 32, location: "实验楼-501", schedule: "周五 5-6节 1-16周", teacher: "张教授" },
  { task_code: "TC0004", name: "音乐鉴赏", capacity: 100, selected_count: 42, credits: 2, department: "艺术学院", hours: 32, location: "艺A-101", schedule: "周三 7-8节 1-16周", teacher: "刘老师" },
  { task_code: "TC0005", name: "生物多样性保护", capacity: 60, selected_count: 23, credits: 2, department: "生科院", hours: 32, location: "生A-203", schedule: "周一 9-10节 1-16周", teacher: "陈老师" },
];

export const mockEnrollmentRun = {
  id: "run_8a3f2c",
  state: "running",
  category_code: "12",
  preferences: [
    { task_code: "TC0001", name: "大学生心理健康" },
    { task_code: "TC0003", name: "人工智能导论" },
  ],
  scheduled_time: "09:00:00",
  run_at: "2026-07-20T09:00:00+08:00",
  attempt_count: 8,
  max_attempts: 15,
  result: null,
  events: [
    { sequence: 1, created_at: "2026-07-20T09:00:01+08:00", type: "calibrated", message: "教务服务器时间校准完成，偏差 +0.3s", attempt: null, course_name: null },
    { sequence: 2, created_at: "2026-07-20T09:00:02+08:00", type: "burst_start", message: "开始连续尝试第一志愿", attempt: 1, course_name: "大学生心理健康" },
    { sequence: 3, created_at: "2026-07-20T09:00:03+08:00", type: "attempt", message: "余量 44，尝试中…", attempt: 1, course_name: "大学生心理健康" },
    { sequence: 4, created_at: "2026-07-20T09:00:04+08:00", type: "attempt", message: "余量 44，尝试中…", attempt: 2, course_name: "大学生心理健康" },
    { sequence: 5, created_at: "2026-07-20T09:00:05+08:00", type: "burst_end", message: "首轮连续尝试结束（5次），切换轮询模式", attempt: 5, course_name: null },
    { sequence: 6, created_at: "2026-07-20T09:00:06+08:00", type: "poll", message: "轮询第一志愿，间隔 500-1000ms", attempt: 6, course_name: "大学生心理健康" },
    { sequence: 7, created_at: "2026-07-20T09:00:07+08:00", type: "poll", message: "轮询第一志愿，间隔 500-1000ms", attempt: 7, course_name: "大学生心理健康" },
    { sequence: 8, created_at: "2026-07-20T09:00:08+08:00", type: "poll", message: "轮询第一志愿，间隔 500-1000ms", attempt: 8, course_name: "大学生心理健康" },
  ],
  created_at: "2026-07-20T09:00:00+08:00",
  finished_at: null,
};

export const mockStudyCabins = [
  { dev_id: 29817269, name: "自习室 A301" },
  { dev_id: 29817270, name: "自习室 A302" },
  { dev_id: 29817271, name: "自习室 B201" },
  { dev_id: 29817272, name: "自习室 B202" },
  { dev_id: 29817273, name: "自习室 C105" },
  { dev_id: 29817274, name: "自习室 C106" },
  { dev_id: 29817275, name: "自习室 D301" },
  { dev_id: 29817276, name: "自习室 D302" },
];

export const mockCredentials = [
  { id: "cred_001", upstream: "academic", purpose: "evaluation", status: "active", expires_at: "2026-08-20T00:00:00+08:00", created_at: "2026-07-20T10:00:00+08:00", last_used_at: "2026-07-20T14:30:00+08:00", metadata: { account_hint: "尾号 0001" }, consent_version: "credential-hosting-v1" },
  { id: "cred_002", upstream: "infospace", purpose: "study_cabin", status: "active", expires_at: "2026-07-27T00:00:00+08:00", created_at: "2026-07-20T11:00:00+08:00", last_used_at: null, metadata: { account_hint: "尾号 0001" }, consent_version: "credential-hosting-v1" },
  { id: "cred_003", upstream: "qun100", purpose: "qun_checkin", status: "active", expires_at: "2026-07-21T00:00:00+08:00", created_at: "2026-07-20T12:00:00+08:00", last_used_at: "2026-07-20T15:00:00+08:00", metadata: { account_hint: "尾号 6789" }, consent_version: "credential-hosting-v1" },
];

export const mockGrades = {
  summary: {
    total_credits: 42.5, total_courses: 18, weighted_gpa: 3.65, required_gpa: 3.72,
    average_score: 85.2, required_average_score: 86.1, failed_count: 0,
    semesters: ["2025-2026-1", "2025-2026-2"],
  },
  grades: [
    { name: "高等数学A", raw_score: "92", numeric_score: 92, grade_point: 4.0, credits: 5, semester: "2025-2026-1", ranking: { class_rank: 3, class_total: 120, course_rank: 5, course_total: 350, distribution: { gte90: 28, s80to90: 65, s70to80: 40, s60to70: 15, lt60: 2 } } },
    { name: "大学英语", raw_score: "88", numeric_score: 88, grade_point: 3.8, credits: 4, semester: "2025-2026-1", ranking: { class_rank: 12, class_total: 120, course_rank: 45, course_total: 350, distribution: { gte90: 20, s80to90: 80, s70to80: 100, s60to70: 40, lt60: 10 } } },
    { name: "线性代数", raw_score: "85", numeric_score: 85, grade_point: 3.7, credits: 3, semester: "2025-2026-1", ranking: { class_rank: 20, class_total: 120, course_rank: 60, course_total: 350, distribution: { gte90: 15, s80to90: 70, s70to80: 120, s60to70: 35, lt60: 10 } } },
    { name: "数据结构", raw_score: "95", numeric_score: 95, grade_point: 4.0, credits: 4, semester: "2025-2026-2", ranking: { class_rank: 1, class_total: 80, course_rank: 2, course_total: 240, distribution: { gte90: 30, s80to90: 90, s70to80: 80, s60to70: 30, lt60: 10 } } },
    { name: "操作系统", raw_score: "82", numeric_score: 82, grade_point: 3.5, credits: 3.5, semester: "2025-2026-2", ranking: null },
  ],
};

export const mockJobs = [
  { id: "job_001", tool_id: "evaluation", operation: "submit", state: "running", credential_id: "cred_001", scheduled_for: "2026-07-20T10:00:00+08:00", attempt_count: 3, max_attempts: 15, receipt: null, error_code: null, next_action: null, created_at: "2026-07-20T10:00:00+08:00", updated_at: "2026-07-20T14:30:00+08:00", cancel_requested_at: null, payload: { strategy: "legacy_positive_random", max_courses: 60 } },
  { id: "job_002", tool_id: "study_cabin", operation: "reserve", state: "verification_required", credential_id: "cred_002", scheduled_for: "2026-07-21T23:59:00+08:00", attempt_count: 5, max_attempts: 120, receipt: null, error_code: null, next_action: "上游提交超时，请到自习室系统核验预约结果", created_at: "2026-07-20T11:00:00+08:00", updated_at: "2026-07-20T23:59:05+08:00", cancel_requested_at: null, payload: { target_date: "2026-07-22", start_time: "09:00", end_time: "11:00", title: "学习" } },
  { id: "job_003", tool_id: "qun_checkin", operation: "submit", state: "succeeded", credential_id: "cred_003", scheduled_for: "2026-07-20T15:00:00+08:00", attempt_count: 1, max_attempts: 1, receipt: { form_id: "123456789012345", title: "每日打卡", submitted: true }, error_code: null, next_action: null, created_at: "2026-07-20T12:00:00+08:00", updated_at: "2026-07-20T15:00:02+08:00", cancel_requested_at: null, payload: { form_id: "123456789012345" } },
  { id: "job_004", tool_id: "evaluation", operation: "submit", state: "succeeded", credential_id: "cred_001", scheduled_for: "2026-07-19T08:00:00+08:00", attempt_count: 2, max_attempts: 15, receipt: { courses_evaluated: 18, strategy: "legacy_positive_random" }, error_code: null, next_action: null, created_at: "2026-07-19T08:00:00+08:00", updated_at: "2026-07-19T09:30:00+08:00", cancel_requested_at: null, payload: { strategy: "legacy_positive_random", max_courses: 60 } },
];

/* 课表相关 mock */
// 设计预览：image_base64 留空时前端以 inline SVG 回退展示
export const mockCaptcha = {
  flow_id: "mock-flow-id-preview-only",
  image_base64: "",
  content_type: "image/png",
  expires_at: new Date(Date.now() + 120 * 1000).toISOString(),
};
export const mockSession = {
  academic_session_id: "mock-academic-session-id-preview",
  expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
};
export const mockWakeupShare = { share_code: "wk-preview-7K9A2F" };
