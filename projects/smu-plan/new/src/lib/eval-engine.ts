/**
 * SMU Auto-Evaluation Engine
 *
 * Ported from Python: https://github.com/rep1ace/SMU-Auto-Evaluation
 * Handles: UIS login → captcha OCR → redirect → fetch courses → submit evaluations
 */

import { createHash } from "crypto";
import { recognizeCaptchaServer } from "./captcha-ocr-server";

/* ── Constants ───────────────────────────────── */

const UIS_BASE = "https://uis.smu.edu.cn";
const ZHJW_BASE = "https://zhjw.smu.edu.cn";

const CAPTCHA_URL = `${UIS_BASE}/imageServlet.do`;
const LOGIN_URL = `${UIS_BASE}/login/login.do`;
const SSO_URL = `${ZHJW_BASE}/new/ssoLogin`;
const COURSES_URL = `${ZHJW_BASE}/new/student/ktpj/xsktpjData`;
const EVAL_PAGE_URL = `${ZHJW_BASE}/new/student/ktpj/showXsktpjwj.page`;
const SAVE_URL = `${ZHJW_BASE}/new/student/ktpj/savePj`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const RETRY_COUNT = 2;
const TIMEOUT_MS = 30000;

/* ── Types ───────────────────────────────────── */

export interface EvalLog {
  time: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface EvalResult {
  success: boolean;
  evaluated: number;
  logs: EvalLog[];
}

interface PendingCourse {
  teadm: string;
  dgksdm: string;
  ktpj: string;
  pjdm: string;
  kcmc?: string;
  teaxm?: string;
}

interface EvalPageData {
  xnxqdm: string;
  pjlxdm: string;
  teaxm: string;
  wjdm: string;
  kcrwdm: string;
  kcptdm: string;
  kcdm: string;
  jxhjdm: string;
}

interface QuestionItem {
  txdm: number;
  zbdm: string;
  zbmc: string;
  zbxmdm: string;
  fz: number;
  dtjg: string;
}

/* ── Cookie helper ───────────────────────────── */

class CookieJar {
  private cookies: Map<string, string> = new Map();

  update(setCookieHeaders: string | string[] | null) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : [setCookieHeaders];
    for (const h of headers) {
      const match = h.match(/^([^=]+)=([^;]*)/);
      if (match) this.cookies.set(match[1], match[2]);
    }
  }

  toString(): string {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

/* ── Helpers ─────────────────────────────────── */

function log(
  logs: EvalLog[],
  level: EvalLog["level"],
  message: string
) {
  logs.push({
    time: new Date().toISOString(),
    level,
    message,
  });
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = RETRY_COUNT
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "manual",
      });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

/* ── Step 1: Get captcha and recognize it ────── */

async function getCaptcha(jar: CookieJar): Promise<string> {
  const resp = await fetchWithRetry(CAPTCHA_URL, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Host: "uis.smu.edu.cn",
      Referer: `${UIS_BASE}/login.jsp?outLine=0`,
    },
  });

  jar.update(resp.headers.getSetCookie?.() || resp.headers.get("set-cookie"));

  const imgBuf = Buffer.from(await resp.arrayBuffer());

  // Server-side OCR using ONNX model directly
  const ocrResult = await recognizeCaptchaServer(imgBuf);
  if (!ocrResult || !ocrResult.text) {
    throw new Error("Captcha OCR failed");
  }

  return ocrResult.text;
}

/* ── Step 2: Login ───────────────────────────── */

async function smuLogin(
  account: string,
  password: string,
  captcha: string,
  jar: CookieJar
): Promise<string> {
  const passwordMd5 = createHash("md5").update(password).digest("hex");

  const body = new URLSearchParams({
    loginName: account,
    password: passwordMd5,
    randcodekey: captcha,
    locationBrowser: "谷歌浏览器[Chrome]",
    appid: "3550176",
    redirect: `${ZHJW_BASE}/new/ssoLogin`,
    strength: "3",
  });

  const resp = await fetchWithRetry(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
      Host: "uis.smu.edu.cn",
      Origin: UIS_BASE,
      Referer: `${UIS_BASE}/login.jsp?redirect=https%3A%2F%2Fzhjw.smu.edu.cn%2Fnew%2FssoLogin`,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: jar.toString(),
    },
    body: body.toString(),
  });

  jar.update(resp.headers.getSetCookie?.() || resp.headers.get("set-cookie"));

  const text = await resp.text();
  if (!text.includes("成功")) {
    throw new Error(`登录失败: ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text);
  return data.ticket;
}

/* ── Step 3: SSO redirect ────────────────────── */

async function ssoRedirect(ticket: string, jar: CookieJar): Promise<void> {
  const url = `${SSO_URL}?ticket=${encodeURIComponent(ticket)}`;

  const resp = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Host: "zhjw.smu.edu.cn",
      Referer: `${ZHJW_BASE}/`,
      Cookie: jar.toString(),
    },
    redirect: "manual",
  });

  jar.update(resp.headers.getSetCookie?.() || resp.headers.get("set-cookie"));

  // Follow redirects manually
  const location = resp.headers.get("location");
  if (location) {
    const resp2 = await fetchWithRetry(
      location.startsWith("http") ? location : `${ZHJW_BASE}${location}`,
      {
        method: "GET",
        headers: {
          "User-Agent": UA,
          Cookie: jar.toString(),
        },
        redirect: "manual",
      }
    );
    jar.update(resp2.headers.getSetCookie?.() || resp2.headers.get("set-cookie"));
  }
}

/* ── Step 4: Get pending courses ─────────────── */

async function getPendingCourses(
  jar: CookieJar,
  targetDate: Date
): Promise<PendingCourse[]> {
  const dateStr = targetDate.toISOString().slice(0, 10);
  const body = new URLSearchParams({
    jsrq: dateStr,
    page: "1",
    rows: "60",
    sort: "jsrq, jcdm2",
    order: "desc",
  });

  const resp = await fetchWithRetry(COURSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
      Host: "zhjw.smu.edu.cn",
      Origin: ZHJW_BASE,
      Referer: `${ZHJW_BASE}/new/student/ktpj`,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: jar.toString(),
    },
    body: body.toString(),
  });

  jar.update(resp.headers.getSetCookie?.() || resp.headers.get("set-cookie"));

  const data = await resp.json();
  return (data.rows || []) as PendingCourse[];
}

/* ── Step 5: Evaluate a single course ────────── */

async function evaluateCourse(
  jar: CookieJar,
  course: PendingCourse,
  logs: EvalLog[]
): Promise<boolean> {
  // 1. Load the evaluation form page
  const pageUrl = `${EVAL_PAGE_URL}?pjlxdm=6&teadm=${course.teadm}&dgksdm=${course.dgksdm}&wjdm=${course.ktpj}`;

  const pageResp = await fetchWithRetry(pageUrl, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Host: "zhjw.smu.edu.cn",
      Referer: `${ZHJW_BASE}/`,
      Cookie: jar.toString(),
    },
  });

  jar.update(pageResp.headers.getSetCookie?.() || pageResp.headers.get("set-cookie"));

  const html = await pageResp.text();

  // 2. Extract form data from script
  const scriptMatch = html.match(/entss\.post[\s\S]*?\{([\s\S]*?)\}/);
  if (!scriptMatch) {
    log(logs, "warn", `未找到评课表单数据: ${course.kcmc || course.teadm}`);
    return false;
  }

  const paramMatches = [...html.matchAll(/(\w+):'([^']+)'/g)];
  const formData: Record<string, string> = {};
  for (const m of paramMatches) {
    formData[m[1]] = m[2];
  }

  if (!formData.teaxm || !formData.kcrwdm) {
    log(logs, "warn", `表单参数不完整: ${course.kcmc || course.teadm}`);
    return false;
  }

  // 3. Parse questions and generate random scores
  const questionMatches = [
    ...html.matchAll(/data-txdm="(\d+)"\s+data-zbdm="([^"]+)"/g),
  ];
  const ratyMatches = [...html.matchAll(/data-wtxm='(\[[\s\S]*?\])'/g)];

  // Random score combinations [25分, 20分, 15分]
  const combinations = [
    [2, 2, 0],
    [1, 2, 1],
    [0, 4, 0],
    [1, 3, 0],
  ];
  const scores = [25, 20, 15];
  const dtjgs = ["★★★★★", "★★★★", "★★★"];

  const dtList: QuestionItem[] = [];
  let scoreTotal = 0;
  let count = 0;

  for (let i = 0; i < Math.min(questionMatches.length, ratyMatches.length); i++) {
    if (count >= 5) break;

    const combo = [...combinations[Math.floor(Math.random() * combinations.length)]];
    let val = Math.floor(Math.random() * 3);
    let attempts = 0;
    while (!combo[val] && attempts < 10) {
      val = Math.floor(Math.random() * 3);
      attempts++;
    }
    if (combo[val]) combo[val]--;

    const txdm = parseInt(questionMatches[i][1]);
    const zbdm = questionMatches[i][2];

    // Try to parse raty options
    let zbxmdm = "";
    try {
      const options = JSON.parse(ratyMatches[i][1]);
      const optIdx = [-1, -2, -3][val];
      zbxmdm = options[options.length + optIdx]?.zbxmdm || options[0]?.zbxmdm || "";
    } catch {
      continue;
    }

    dtList.push({
      txdm,
      zbdm,
      zbmc: "",
      zbxmdm,
      fz: scores[val],
      dtjg: dtjgs[val],
    });
    scoreTotal += scores[val];
    count++;
  }

  if (dtList.length === 0) {
    log(logs, "warn", `无法解析评课题目: ${formData.teaxm} ${formData.kcdm}`);
    return false;
  }

  // 4. Submit evaluation
  const submitBody = new URLSearchParams({
    xnxqdm: formData.xnxqdm || "",
    pjlxdm: formData.pjlxdm || "6",
    teadm: course.teadm,
    teabh: course.teadm,
    teaxm: formData.teaxm,
    wjdm: formData.wjdm || "",
    kcrwdm: formData.kcrwdm,
    kcptdm: formData.kcptdm || "",
    kcdm: formData.kcdm || "",
    dgksdm: course.dgksdm,
    jxhjdm: formData.jxhjdm || "",
    wtpf: String(scoreTotal),
    pfsm: "",
    dt: JSON.stringify(dtList),
  });

  const saveResp = await fetchWithRetry(SAVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA,
      Host: "zhjw.smu.edu.cn",
      Origin: ZHJW_BASE,
      Referer: `${ZHJW_BASE}/new/student/ktpj`,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: jar.toString(),
    },
    body: submitBody.toString(),
  });

  jar.update(saveResp.headers.getSetCookie?.() || saveResp.headers.get("set-cookie"));

  const saveText = await saveResp.text();
  if (!saveResp.ok) {
    throw new Error(`评课提交失败: ${saveResp.status} ${saveText.slice(0, 200)}`);
  }

  const normalizedSaveText = saveText.trim();
  const saveSucceeded =
    normalizedSaveText.includes("成功")
    || normalizedSaveText.includes("已评")
    || normalizedSaveText.includes("已评价")
    || normalizedSaveText.includes("\"success\":true")
    || normalizedSaveText === "true";

  if (!saveSucceeded) {
    log(
      logs,
      "warn",
      `评课提交未确认成功: ${formData.teaxm} - ${formData.kcdm} (${normalizedSaveText.slice(0, 120)})`,
    );
    return false;
  }

  log(logs, "success", `已评课 ${formData.teaxm} - ${formData.kcdm} (${scoreTotal}分)`);
  return true;
}

/* ── Main runner ─────────────────────────────── */

export async function runEvaluation(
  account: string,
  password: string
): Promise<EvalResult> {
  const logs: EvalLog[] = [];
  let evaluated = 0;

  try {
    // Login with retries (captcha OCR may fail)
    const jar = new CookieJar();
    let ticket = "";
    let loginSuccess = false;

    for (let attempt = 1; attempt <= 5; attempt++) {
      log(logs, "info", `登录尝试 ${attempt}/5...`);
      try {
        const captcha = await getCaptcha(jar);
        log(logs, "info", `验证码识别: ${captcha}`);
        ticket = await smuLogin(account, password, captcha, jar);
        loginSuccess = true;
        log(logs, "success", "登录成功");
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(logs, "warn", `登录失败: ${msg}`);
      }
    }

    if (!loginSuccess) {
      log(logs, "error", "登录失败，已达最大重试次数");
      return { success: false, evaluated: 0, logs };
    }

    // SSO redirect
    log(logs, "info", "SSO 跳转中...");
    await ssoRedirect(ticket, jar);
    log(logs, "info", "已进入教务系统");

    // Get courses for today and yesterday
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const processedKeys = new Set<string>();

    for (const date of [today, yesterday]) {
      log(logs, "info", `查询 ${date.toISOString().slice(0, 10)} 的待评课程...`);
      const courses = await getPendingCourses(jar, date);

      const pending = courses.filter((c) => !c.pjdm || c.pjdm === "");
      log(logs, "info", `找到 ${pending.length} 门待评课程`);

      for (const course of pending) {
        const key = `${course.teadm}-${course.dgksdm}-${course.ktpj}`;
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);

        try {
          const ok = await evaluateCourse(jar, course, logs);
          if (ok) evaluated++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(logs, "error", `评课异常: ${course.kcmc || course.teadm} - ${msg}`);
        }

        // Small delay between submissions
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
      }
    }

    if (evaluated === 0) {
      log(logs, "info", "没有待评课程");
    } else {
      log(logs, "success", `评课完成! 共评价 ${evaluated} 门课程`);
    }

    return { success: true, evaluated, logs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(logs, "error", `运行异常: ${msg}`);
    return { success: false, evaluated, logs };
  }
}
