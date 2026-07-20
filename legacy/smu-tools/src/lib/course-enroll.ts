/**
 * Course enrollment helper — TypeScript port of SMU-Lecturehelper-GUI/main.py
 *
 * Flow:
 *   1. Login via UIS SSO (reuse smu-auth.ts)
 *   2. Get course categories (公选/限选/体育/etc.)
 *   3. Get available courses in a category
 *   4. Submit enrollment requests with burst + rotate strategy
 */

const ZHJW_BASE = "https://zhjw.smu.edu.cn";
const XK_ROOT_URL = `${ZHJW_BASE}/new/student/xsxk/`;
const WELCOME_URL = `${ZHJW_BASE}/new/welcome.page?ui=new`;

const MAX_ATTEMPTS = 120;
const PRIMARY_BURST_ATTEMPTS = 12;

const HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Host: "zhjw.smu.edu.cn",
    Referer: `${ZHJW_BASE}/`,
};

function buildCookieHeader(cookies: string[]): string {
    return cookies.map((c) => c.split(";")[0]).join("; ");
}

// ─── Types ────────────────────────────────────────────────────

export interface CourseCategory {
    code: string;
    title: string;
}

export interface CourseItem {
    kcrwdm: string;     // 课程任务代码（选课用）
    kcmc: string;       // 课程名称
    teaxm: string;      // 教师姓名
    pkrs: number;       // 已选人数  
    xkrs: number;       // 限选人数
    xf: number;         // 学分
    zxs: number;        // 总学时
    sksj: string;       // 上课时间
    skdd: string;       // 上课地点
    kkbmmc: string;     // 开课部门
}

export interface EnrollResult {
    success: boolean;
    message: string;
    courseName?: string;
}

export type EnrollLogger = (event: {
    type: "calibrating" | "waiting" | "attempt" | "success" | "fail" | "error" | "info";
    message: string;
    index?: number;
    course?: string;
}) => void;

// ─── Verify Session ───────────────────────────────────────────

export async function verifySession(cookies: string[]): Promise<boolean> {
    try {
        const res = await fetch(WELCOME_URL, {
            headers: {
                ...HEADERS,
                Cookie: buildCookieHeader(cookies),
                Accept: "text/html,*/*",
            },
        });
        const text = await res.text();
        // If redirected to login page, session is invalid
        return !text.includes("统一认证登录") && !text.includes("扫码登录");
    } catch {
        return false;
    }
}

// ─── Time Calibration ─────────────────────────────────────────

/**
 * Measure clock difference between local machine and server.
 * Returns offset in milliseconds (positive = server ahead).
 */
export async function calibrateTime(cookies: string[], samples = 3): Promise<number> {
    let bestDiff = 0;
    let bestRtt = Infinity;

    for (let i = 0; i < samples; i++) {
        const before = Date.now();
        try {
            const res = await fetch(WELCOME_URL, {
                headers: {
                    ...HEADERS,
                    Cookie: buildCookieHeader(cookies),
                    Accept: "text/html,*/*",
                },
            });
            const after = Date.now();
            const dateHeader = res.headers.get("Date");
            if (!dateHeader) continue;

            const serverTime = new Date(dateHeader).getTime();
            const rtt = after - before;
            const localEstimate = before + rtt / 2;
            const diff = serverTime - localEstimate;

            if (rtt < bestRtt) {
                bestRtt = rtt;
                bestDiff = diff;
            }
        } catch {
            // ignore failed sample
        }
        // Small delay between samples
        await new Promise((r) => setTimeout(r, 30));
    }

    return bestDiff;
}

// ─── Course Categories ────────────────────────────────────────

/**
 * Fetch available course enrollment categories (公选, 限选, 体育, etc.)
 */
export async function getCourseCategories(cookies: string[]): Promise<CourseCategory[]> {
    const cookieHeader = buildCookieHeader(cookies);

    // Visit welcome page first to establish context
    await fetch(WELCOME_URL, {
        headers: { ...HEADERS, Cookie: cookieHeader, Accept: "text/html,*/*" },
    });

    // Visit enrollment root page
    const res = await fetch(XK_ROOT_URL, {
        headers: { ...HEADERS, Cookie: cookieHeader, Accept: "text/html,*/*" },
    });
    const html = await res.text();
    console.log("[enroll] page status:", res.status, "length:", html.length);
    console.log("[enroll] HTML snippet (first 2000):", html.slice(0, 2000));

    if (html.includes("统一认证登录") || html.includes("扫码登录")) {
        throw new Error("会话已过期，请重新登录");
    }

    const categories: CourseCategory[] = [];
    const seen = new Set<string>();

    // Pattern 1: data-href="/new/student/xsxk/xklx/12" lay-iframe="公共选修课选课"
    const dataHrefRegex = /data-href\s*=\s*["']([^"']*xklx[^"']*)["'][^>]*lay-iframe\s*=\s*["']([^"']*)["']/gi;
    let match;
    while ((match = dataHrefRegex.exec(html)) !== null) {
        const codeMatch = match[1].match(/xklx\/(\d+)/);
        if (codeMatch && !seen.has(codeMatch[1])) {
            seen.add(codeMatch[1]);
            categories.push({ code: codeMatch[1], title: match[2] });
        }
    }

    // Pattern 2: lay-iframe first, then data-href (reversed order)
    const revRegex = /lay-iframe\s*=\s*["']([^"']*)["'][^>]*data-href\s*=\s*["']([^"']*xklx[^"']*)["']/gi;
    while ((match = revRegex.exec(html)) !== null) {
        const codeMatch = match[2].match(/xklx\/(\d+)/);
        if (codeMatch && !seen.has(codeMatch[1])) {
            seen.add(codeMatch[1]);
            categories.push({ code: codeMatch[1], title: match[1] });
        }
    }

    // Pattern 3: href with xklx path + text content
    const hrefRegex = /href\s*=\s*["']([^"']*xklx\/(\d+)[^"']*)["'][^>]*>([^<]+)</gi;
    while ((match = hrefRegex.exec(html)) !== null) {
        if (!seen.has(match[2])) {
            seen.add(match[2]);
            categories.push({ code: match[2], title: match[3].trim() });
        }
    }

    // Pattern 4: onclick with xklx URL
    const onclickRegex = /onclick\s*=\s*["'][^"']*xklx\/(\d+)[^"']*["'][^>]*>([^<]*)</gi;
    while ((match = onclickRegex.exec(html)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            categories.push({ code: match[1], title: match[2].trim() || `类型${match[1]}` });
        }
    }

    // Pattern 5: Generic — any string containing /xklx/ followed by digits
    const genericRegex = /['"]([^'"]*\/xklx\/(\d+)[^'"]*)['"]/gi;
    while ((match = genericRegex.exec(html)) !== null) {
        if (!seen.has(match[2])) {
            seen.add(match[2]);
            categories.push({ code: match[2], title: `类型${match[2]}` });
        }
    }

    // Pattern 6: xklxdm=digits in query params
    const paramRegex = /xklxdm=(\d+)/gi;
    while ((match = paramRegex.exec(html)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            categories.push({ code: match[1], title: `类型${match[1]}` });
        }
    }

    console.log("[enroll] found categories:", categories);

    if (categories.length === 0) {
        const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(`未找到选课类型。页面内容片段：${bodyText.slice(0, 160)}`);
    }

    return categories;
}


// ─── Course List ──────────────────────────────────────────────

/**
 * Fetch available courses for a given category
 */
export async function getCourseList(
    cookies: string[],
    categoryCode: string,
): Promise<{ courses: CourseItem[]; categoryUrl: string }> {
    const cookieHeader = buildCookieHeader(cookies);
    const categoryUrl = `${XK_ROOT_URL}xklx/${categoryCode}`;
    const courseListUrl = `${categoryUrl}/kxkc`;

    // Fetch courses with pagination (match the browser's EasyUI datagrid format)
    const allCourses: CourseItem[] = [];
    let page = 1;
    let total = Infinity;

    while (allCourses.length < total) {
        const body = new URLSearchParams({
            page: String(page),
            rows: "50",
            sort: "kcrwdm",
            order: "asc",
        });

        const res = await fetch(courseListUrl, {
            method: "POST",
            headers: {
                ...HEADERS,
                Cookie: cookieHeader,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });

        const text = await res.text();
        if (!text.startsWith("{")) {
            throw new Error(`课程列表返回异常: ${text.slice(0, 200)}`);
        }

        const json = JSON.parse(text);
        total = json.total ?? 0;
        const rows = json.rows ?? [];

        for (const r of rows) {
            allCourses.push({
                kcrwdm: String(r.kcrwdm || ""),
                kcmc: String(r.kcmc || ""),
                teaxm: String(r.teaxm || ""),
                pkrs: Number(r.pkrs) || 0,
                xkrs: Number(r.xkrs) || 0,
                xf: Number(r.xf) || 0,
                zxs: Number(r.zxs) || 0,
                sksj: String(r.sksj || ""),
                skdd: String(r.skdd || ""),
                kkbmmc: String(r.kkbmmc || ""),
            });
        }

        if (rows.length === 0) break;
        page++;
    }

    return { courses: allCourses, categoryUrl };
}

// ─── Order a Single Course ────────────────────────────────────

async function orderCourse(
    cookies: string[],
    kcrwdm: string,
    kcmc: string,
    categoryUrl: string,
): Promise<{ code: number; message: string }> {
    const addUrl = `${categoryUrl}/add`;
    const cookieHeader = buildCookieHeader(cookies);

    const body = new URLSearchParams({
        kcrwdm,
        kcmc,
        qz: "-1",
        xxyqdm: "",
        hlct: "0",
    });

    const res = await fetch(addUrl, {
        method: "POST",
        headers: {
            ...HEADERS,
            Cookie: cookieHeader,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { code: -1, message: `非JSON响应: ${text.slice(0, 100)}` };
    }
}

// ─── Enrollment Job (burst + rotate) ──────────────────────────

/**
 * Main enrollment loop — matches Python's select_job():
 *   - First PRIMARY_BURST_ATTEMPTS: only try first preference
 *   - After that: rotate through all preferences
 *
 * @param preferences - 1-indexed course indices (up to 4), null = skip
 * @param courses - full course list from getCourseList()
 * @param categoryUrl - base URL for the category
 * @param cookies - session cookies
 * @param logger - callback for real-time progress updates
 */
export async function enrollJob(
    preferences: (number | null)[],
    courses: CourseItem[],
    categoryUrl: string,
    cookies: string[],
    logger: EnrollLogger,
): Promise<EnrollResult> {
    // Validate preferences
    const validOrders: number[] = [];
    for (const pref of preferences) {
        if (pref === null || pref === undefined) continue;
        if (pref < 1 || pref > courses.length) {
            logger({ type: "info", message: `忽略越界志愿序号: ${pref}` });
            continue;
        }
        if (!validOrders.includes(pref)) {
            validOrders.push(pref);
        }
    }

    if (validOrders.length === 0) {
        return { success: false, message: "没有有效志愿" };
    }

    logger({
        type: "info",
        message: `有效志愿: ${validOrders.map((i) => `${i}.${courses[i - 1].kcmc}`).join(", ")}`,
    });

    let lastMessage = "";

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // Burst strategy: first N attempts only try first preference
        const orderIdx =
            i < PRIMARY_BURST_ATTEMPTS
                ? validOrders[0]
                : validOrders[(i - PRIMARY_BURST_ATTEMPTS) % validOrders.length];

        const course = courses[orderIdx - 1];

        logger({
            type: "attempt",
            index: i + 1,
            course: course.kcmc,
            message: `[${i + 1}/${MAX_ATTEMPTS}] 正在抢: ${course.kcmc}`,
        });

        try {
            const result = await orderCourse(cookies, course.kcrwdm, course.kcmc, categoryUrl);
            const msg = result.message || "";
            lastMessage = msg || JSON.stringify(result);

            if (result.code === 0 || msg === "您已经选了该门课程") {
                logger({
                    type: "success",
                    course: course.kcmc,
                    message: `选课成功：${course.kcmc}`,
                });
                return { success: true, message: `选课成功：${course.kcmc}`, courseName: course.kcmc };
            }

            if (msg === "超出选课要求门数(1.0门)") {
                logger({ type: "success", message: "你已经达到选课上限" });
                return { success: true, message: "已达到选课上限" };
            }

            // Log the failure reason but continue
            if (i % 10 === 0) {
                logger({ type: "info", message: `服务器返回: ${msg}` });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            lastMessage = `请求异常: ${errMsg}`;
            // Don't log every error to avoid spam
            if (i % 10 === 0) {
                logger({ type: "error", message: lastMessage });
            }
        }
    }

    logger({ type: "fail", message: `${MAX_ATTEMPTS}次尝试后仍未成功，最后: ${lastMessage}` });
    return { success: false, message: `抢课失败: ${lastMessage}` };
}

// ─── Wait Until Target Time ───────────────────────────────────

/**
 * Compute the local timestamp to start enrollment,
 * accounting for server-local time difference.
 *
 * @param timeStr - target time in "HH:MM:SS" format (server time)
 * @param timeDiffMs - server-local offset from calibrateTime()
 * @param sendAheadMs - how many ms to send before target (default 50)
 */
export function computeRunAt(
    timeStr: string,
    timeDiffMs: number,
    sendAheadMs = 50,
): number {
    const [h, m, s] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);

    // target is in server time; convert to local time
    // localTime = serverTime - timeDiff
    const targetLocal = target.getTime() - timeDiffMs - sendAheadMs;

    // If the target is in the past, assume it's for tomorrow
    if (targetLocal <= Date.now()) {
        return targetLocal + 24 * 60 * 60 * 1000;
    }

    return targetLocal;
}
