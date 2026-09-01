// Canvas design runtime editable source marker: api-layer
// Nanyee API 集成层：CSRF / 401 / Turnstile / anti_abuse_pass / 敏感态内存生命周期
// 严格遵循 docs/frontend-integration.md 契约
//
// 说明：apiFetch 封装已按契约实现（credentials:include、X-CSRF-Token、统一错误解析）。
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
      // 后台探测登录态：未登录是正常情况，不触发全局跳登录
      // AuthResponse = { user, csrf_header }，用户对象包在 user 键里
      const u = await apiGet("/auth/me", { silent401: true });
      const user = u.user;
      setUser(user);
      return user;
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
//   method, body, headers, action(用于 anti_abuse_pass 缓存与 Turnstile 挑战),
//   turnstileToken(已取到的 token，注入 body/query/表单字段),
//   silent401(为 true 时 401 不触发全局 nanyee:unauth 跳登录，用于后台探测类请求)
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, headers = {}, action, silent401 } = options;
  const opts = {
    method,
    credentials: "include",
    headers: { ...headers },
  };
  // anti_abuse_pass / turnstile_token 是请求体字段：
  // JSON body 注入字段；GET 拼 query；multipart 走表单字段
  const pass = action ? getAntiAbusePass(action) : null;
  const turnstileToken = options.turnstileToken || null;
  let url = API_BASE + path;
  if (body !== undefined && !(body instanceof FormData)) {
    const payload = { ...body };
    if (pass) payload.anti_abuse_pass = pass;
    if (turnstileToken) payload.turnstile_token = turnstileToken;
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(payload);
  } else if (body instanceof FormData) {
    if (pass) body.append("anti_abuse_pass", pass);
    if (turnstileToken) body.append("turnstile_token", turnstileToken);
    opts.body = body;
  } else if (method.toUpperCase() === "GET") {
    const params = [];
    if (pass) params.push(`anti_abuse_pass=${encodeURIComponent(pass)}`);
    if (turnstileToken) params.push(`turnstile_token=${encodeURIComponent(turnstileToken)}`);
    if (params.length) url += (url.includes("?") ? "&" : "?") + params.join("&");
  }
  if (isWriteMethod(method)) {
    const csrf = getCsrfToken();
    if (csrf) opts.headers["X-CSRF-Token"] = csrf;
  }

  const resp = await fetch(url, opts);
  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await resp.json() : await resp.text();

  if (!resp.ok) {
    const err = new ApiError(isJson ? data : undefined, resp.status);
    // 401：清理内存用户态，跳登录（silent401 时不打扰，由调用方自行处理）
    if (err.code === "AUTHENTICATION_REQUIRED" && !silent401) {
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
  { purpose: "school", upstream: "school", label: "学校统一认证", secretType: "school_account" },
  { purpose: "evaluation", upstream: "academic", label: "自动评课", secretType: "school_account" },
  { purpose: "study_cabin", upstream: "infospace", label: "自习室预约", secretType: "school_account" },
  { purpose: "qun_checkin", upstream: "qun100", label: "群报数", secretType: "qun_token" },
];

// 学校统一认证凭据（school）可同时用于这些工具用途
export const SCHOOL_SHARED_PURPOSES = ["school", "evaluation", "study_cabin"];

/* ---------- 确认版本常量 ---------- */
export const CONFIRMATION_VERSIONS = {
  enrollmentRun: "course_selection:auto_enroll:v1",
  evaluationJob: "evaluation:submit:v1",
  studyCabinJob: "study_cabin:reserve:v1",
  qunSubmit: "qun_checkin:submit:v1",
  wakeupShare: "timetable:wakeup_share:v1",
  credentialHosting: "credential-hosting-v1",
};

// 列表接口不会把已过期的凭据标记为失效，需自行判断 expires_at
export function isCredentialUsable(c) {
  return !!c && c.status === "active" && !!c.expires_at && new Date(c.expires_at).getTime() > Date.now();
}

/* ---------- API 端点封装 ---------- */
// action 写死在后端 gate 名上，用于 anti_abuse_pass 缓存与 Turnstile 挑战
// 选课
export function fetchEnrollmentCategories(academicSessionId, opts) {
  return apiPost("/smu/enrollment/categories", { academic_session_id: academicSessionId }, { ...opts, action: "smu_enrollment_read" });
}
export function fetchEnrollmentCourses(academicSessionId, categoryCode, opts) {
  return apiPost("/smu/enrollment/courses", { academic_session_id: academicSessionId, category_code: categoryCode }, { ...opts, action: "smu_enrollment_read" });
}
export function startEnrollmentRun(body, opts) {
  return apiPost("/smu/enrollment/runs", body, { ...opts, action: "smu_enrollment_run" });
}
export function getEnrollmentRun(runId, opts) {
  return apiGet(`/smu/enrollment/runs/${runId}`, opts);
}
export function cancelEnrollmentRun(runId, opts) {
  return apiPost(`/smu/enrollment/runs/${runId}/cancel`, undefined, opts);
}

export function createEnrollmentCookieSession(cookie, opts) {
  return apiPost("/smu/enrollment/session/cookie", { cookie }, { ...opts, action: "smu_cookie_login" });
}

// 课表 WakeUp 分享
export function shareWakeup(body, opts) {
  return apiPost("/smu/timetable.wakeup.share", body, { ...opts, action: "smu_timetable" });
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
  return apiPost("/credentials", body, { ...opts, action: "credential_create" });
}
export function listCredentials(opts) {
  return apiGet("/credentials", opts);
}
export function revokeCredential(id, opts) {
  return apiDelete(`/credentials/${id}`, opts);
}
export function renewCredential(id, body, opts) {
  return apiPost(`/credentials/${id}/renew`, body, { ...opts, action: "credential_renew" });
}
export function revealCredential(id, opts) {
  return apiPost(`/credentials/${id}/reveal`, undefined, { ...opts, action: "credential_reveal" });
}
export function deleteCredential(id, opts) {
  return apiDelete(`/credentials/${id}?hard=true`, opts);
}

// 任务
export function createJob(body, opts) {
  return apiFetch("/jobs", { ...opts, method: "POST", body, action: "job_create", headers: { ...(opts?.headers || {}), "Idempotency-Key": opts?.idempotencyKey || crypto.randomUUID() } });
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

/* ---------- 文件下载（ICS / WakeUp 课表导出） ---------- */
// POST 后以 Blob 触发浏览器下载；错误结构与 apiFetch 一致
// opts.action：与 apiFetch 相同，anti_abuse_pass / turnstile_token 注入 JSON body
export async function apiDownload(path, body, filename, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const payload = { ...body };
  const pass = opts.action ? getAntiAbusePass(opts.action) : null;
  if (pass) payload.anti_abuse_pass = pass;
  if (opts.turnstileToken) payload.turnstile_token = opts.turnstileToken;
  const resp = await fetch(API_BASE + path, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const isJson = (resp.headers.get("content-type") || "").includes("application/json");
    const err = new ApiError(isJson ? await resp.json() : undefined, resp.status);
    if (err.code === "AUTHENTICATION_REQUIRED") {
      window.dispatchEvent(new CustomEvent("nanyee:unauth"));
    }
    throw err;
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

