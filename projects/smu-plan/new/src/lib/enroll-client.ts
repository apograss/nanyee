/**
 * Client-side course enrollment logic — runs in the BROWSER.
 * Login/captcha/categories route through local server-side proxy.
 * Enrollment attempts route through CF Worker/VPS proxy to protect server IP.
 */

// ─── Configuration ────────────────────────────────────────────

const UIS = "https://uis.smu.edu.cn";
const ZHJW = "https://zhjw.smu.edu.cn";

// ─── Multi-Proxy Support ──────────────────────────────────────
// Users can choose which proxy node to use for enrollment requests

export interface ProxyNode {
    id: string;
    label: string;
    url: string;
    region: string;
}

export const PROXY_NODES: ProxyNode[] = [
    { id: "safe", label: "安全代理", url: "internal", region: "主站" },
];

let activeProxyUrl: string = PROXY_NODES[0].url;

export function setActiveProxy(proxyId: string): void {
    const node = PROXY_NODES.find((n) => n.id === proxyId);
    if (node) activeProxyUrl = node.url;
}

export function getActiveProxy(): ProxyNode | undefined {
    return PROXY_NODES.find((n) => n.url === activeProxyUrl);
}

const XK_ROOT = `/new/student/xsxk/`;
const WELCOME_PATH = `/new/welcome.page?ui=new`;

const MAX_ATTEMPTS = 15;
const PRIMARY_BURST_ATTEMPTS = 5;
const ATTEMPT_DELAY_MIN = 500;   // 随机延迟最小值 ms
const ATTEMPT_DELAY_MAX = 1000;  // 随机延迟最大值 ms

// ─── Types ────────────────────────────────────────────────────

export interface CourseCategory {
    code: string;
    title: string;
}

export interface CourseItem {
    kcrwdm: string;
    kcmc: string;
    teaxm: string;
    pkrs: number;
    xkrs: number;
    xf: number;
    zxs: number;
    sksj: string;
    skdd: string;
    kkbmmc: string;
}

export interface EnrollResult {
    success: boolean;
    message: string;
    courseName?: string;
}

export type LogCallback = (event: {
    type: "calibrating" | "waiting" | "attempt" | "success" | "fail" | "error" | "info";
    message: string;
    index?: number;
    course?: string;
}) => void;

// ─── Cookie Management ────────────────────────────────────────

function mergeCookies(existing: string[], incoming: string[]): string[] {
    const map = new Map<string, string>();
    for (const c of [...existing, ...incoming]) {
        const nameVal = c.split(";")[0];
        const name = nameVal.split("=")[0].trim();
        map.set(name, c);
    }
    return Array.from(map.values());
}

function cookieString(cookies: string[]): string {
    return cookies.map((c) => c.split(";")[0]).join("; ");
}

// ─── Server-Side Proxy Fetch ─────────────────────────────────
// Routes through /api/tools/proxy (local Next.js server)
// which directly reaches uis.smu.edu.cn and zhjw.smu.edu.cn

async function proxyFetch(
    url: string,
    sessionId: string,
    options: RequestInit = {},
): Promise<{ status: number; body: string; location?: string; dateHeader?: string }> {
    const method = (options.method as string) || "GET";
    const headers = (options.headers as Record<string, string>) || {};
    const body = typeof options.body === "string" ? options.body : undefined;

    console.log(`[proxy] ${method} ${url}`);

    const res = await fetch("/api/tools/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, headers, body, sessionId }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
        console.error(`[proxy] Error:`, data.error);
        throw new Error(data.error || `Proxy error: ${res.status}`);
    }

    console.log(`[proxy] → ${data.status}`);

    return {
        status: data.status,
        body: data.body || "",
        location: data.location,
        dateHeader: data.dateHeader,
    };
}

// ─── CF Worker / VPS Proxy Fetch (for enrollment IP protection) ──

async function enrollProxyFetch(
    targetUrl: string,
    sessionId: string,
    options: RequestInit = {},
): Promise<{ status: number; body: string; location?: string }> {
    return proxyFetch(targetUrl, sessionId, options);
}

// ─── Login ────────────────────────────────────────────────────

// Minimal MD5 for browser (from public domain)
function md5Browser(input: string): string {
    function md5cycle(x: number[], k: number[]) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
        a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
        a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
        a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
        x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
    }
    function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }
    function md51(s: string) {
        const n = s.length;
        let state = [1732584193, -271733879, -1732584194, 271733878];
        let i: number;
        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    function md5blk(s: string) {
        const md5blks: number[] = [];
        for (let i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) +
                (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }
    function rhex(n: number) {
        const hc = "0123456789abcdef";
        let s = "";
        for (let j = 0; j < 4; j++)
            s += hc.charAt((n >> (j * 8 + 4)) & 0x0f) + hc.charAt((n >> (j * 8)) & 0x0f);
        return s;
    }
    function add32(a: number, b: number) {
        return (a + b) & 0xffffffff;
    }
    const x = md51(input);
    return rhex(x[0]) + rhex(x[1]) + rhex(x[2]) + rhex(x[3]);
}

// ─── Captcha ──────────────────────────────────────────────────

export async function fetchCaptchaViaProxy(): Promise<{
    imageBase64: string;
    sessionId: string;
}> {
    const res = await fetch("/api/tools/captcha");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    return {
        imageBase64: data.image,
        sessionId: data.sessionId,
    };
}

// ─── Login via Proxy ──────────────────────────────────────────

export async function loginViaProxy(
    account: string,
    password: string,
    captcha: string,
    sessionId: string,
): Promise<string> {
    const passwordMd5 = md5Browser(password);

    const body = new URLSearchParams({
        loginName: account,
        password: passwordMd5,
        randcodekey: captcha,
        locationBrowser: "?????[Chrome]",
        appid: "3550176",
        redirect: "https://zhjw.smu.edu.cn/new/ssoLogin",
        strength: "3",
    });

    console.log("[login] Sending login POST...");
    const loginRes = await proxyFetch(`${UIS}/login/login.do`, sessionId, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
    });

    console.log("[login] Response:", loginRes.status, loginRes.body.slice(0, 200));

    if (loginRes.status !== 200 || !loginRes.body.includes("\u6210\u529f")) {
        let errorMsg = "\u767b\u5f55\u5931\u8d25";
        try {
            const json = JSON.parse(loginRes.body);
            errorMsg = json.message || json.msg || "\u767b\u5f55\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5b66\u53f7\u3001\u5bc6\u7801\u548c\u9a8c\u8bc1\u7801";
        } catch {
            errorMsg = `\u767b\u5f55\u5931\u8d25: ${loginRes.body.slice(0, 200)}`;
        }
        throw new Error(errorMsg);
    }

    const json = JSON.parse(loginRes.body);
    const ticket = json.ticket as string;
    if (!ticket) throw new Error("\u767b\u5f55\u6210\u529f\u4f46\u672a\u83b7\u53d6\u5230 ticket");

    let currentPath = `/new/ssoLogin?ticket=${encodeURIComponent(ticket)}`;

    console.log("[login] Following SSO redirects...");
    for (let i = 0; i < 5; i++) {
        console.log(`[login] Redirect ${i + 1}: ${ZHJW}${currentPath}`);
        const res = await proxyFetch(`${ZHJW}${currentPath}`, sessionId, {
            headers: { Accept: "text/html,*/*" },
        });

        if (!res.location) { console.log("[login] No more redirects"); break; }
        const loc = res.location;
        console.log(`[login] -> Location: ${loc}`);
        if (loc.startsWith("http")) {
            if (loc.includes("zhjw.smu.edu.cn")) {
                currentPath = loc.replace("https://zhjw.smu.edu.cn", "");
            } else {
                break;
            }
        } else {
            currentPath = loc;
        }
    }

    console.log("[login] Login complete via session", sessionId);
    return sessionId;
}

// ─── Cookie Login (reuse browser session, no SSO) ─────────────

export async function cookieLoginViaProxy(
    cookieText: string,
): Promise<string> {
    const resp = await fetch("/api/tools/session/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookiesText: cookieText }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data.error?.message || data.error || "Cookie \u767b\u5f55\u5931\u8d25");
    }

    const sessionId = data.data.sessionId as string;
    const res = await proxyFetch(`${ZHJW}${WELCOME_PATH}`, sessionId, {
        headers: { Accept: "text/html,*/*" },
    });

    if (res.body.includes("\u7edf\u4e00\u8ba4\u8bc1\u767b\u5f55") || res.body.includes("\u626b\u7801\u767b\u5f55")) {
        throw new Error("Cookie \u4f1a\u8bdd\u65e0\u6548\uff08\u5df2\u8fc7\u671f\u6216\u672a\u767b\u5f55\uff09\u3002\u8bf7\u5728\u6d4f\u89c8\u5668\u91cd\u65b0\u767b\u5f55\u540e\u590d\u5236\u6700\u65b0 Cookie\u3002");
    }

    console.log("[cookie-login] Session valid", sessionId);
    return sessionId;
}

// ─── Course Categories ────────────────────────────────────────

export async function getCategoriesViaProxy(
    sessionId: string,
): Promise<{ categories: CourseCategory[] }> {
    const res = await proxyFetch(`${ZHJW}${XK_ROOT}`, sessionId, {
        headers: { Accept: "text/html,*/*" },
    });

    const html = res.body;

    if (html.includes("\u7edf\u4e00\u8ba4\u8bc1\u767b\u5f55") || html.includes("\u626b\u7801\u767b\u5f55")) {
        throw new Error("\u4f1a\u8bdd\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55");
    }

    const categories: CourseCategory[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    const p1 = /data-href\s*=\s*["']([^"']*xklx[^"']*)["'][^>]*lay-iframe\s*=\s*["']([^"']*)["']/gi;
    while ((match = p1.exec(html)) !== null) {
        const cm = match[1].match(/xklx\/(\d+)/);
        if (cm && !seen.has(cm[1])) { seen.add(cm[1]); categories.push({ code: cm[1], title: match[2] }); }
    }
    const p2 = /lay-iframe\s*=\s*["']([^"']*)["'][^>]*data-href\s*=\s*["']([^"']*xklx[^"']*)["']/gi;
    while ((match = p2.exec(html)) !== null) {
        const cm = match[2].match(/xklx\/(\d+)/);
        if (cm && !seen.has(cm[1])) { seen.add(cm[1]); categories.push({ code: cm[1], title: match[1] }); }
    }
    const p3 = /href\s*=\s*["']([^"']*xklx\/(\d+)[^"']*)["'][^>]*>([^<]+)</gi;
    while ((match = p3.exec(html)) !== null) {
        if (!seen.has(match[2])) { seen.add(match[2]); categories.push({ code: match[2], title: match[3].trim() }); }
    }
    const p4 = /['"]([^'"]*\/xklx\/(\d+)[^'"]*)['"]/gi;
    while ((match = p4.exec(html)) !== null) {
        if (!seen.has(match[2])) { seen.add(match[2]); categories.push({ code: match[2], title: `\u7c7b\u578b${match[2]}` }); }
    }
    const p5 = /xklxdm=(\d+)/gi;
    while ((match = p5.exec(html)) !== null) {
        if (!seen.has(match[1])) { seen.add(match[1]); categories.push({ code: match[1], title: `\u7c7b\u578b${match[1]}` }); }
    }

    if (categories.length === 0) {
        const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(`\u672a\u627e\u5230\u9009\u8bfe\u7c7b\u578b: ${bodyText.slice(0, 160)}`);
    }

    return { categories };
}

// ─── Course List ──────────────────────────────────────────────

export async function getCoursesViaProxy(
    sessionId: string,
    categoryCode: string,
): Promise<{ courses: CourseItem[]; categoryUrl: string }> {
    const categoryPath = `${XK_ROOT}xklx/${categoryCode}`;
    const courseListPath = `${categoryPath}/kxkc`;

    const allCourses: CourseItem[] = [];
    let page = 1;
    let total = Infinity;

    while (allCourses.length < total) {
        const body = new URLSearchParams({
            page: String(page),
            rows: "50",
        });

        const res = await proxyFetch(`${ZHJW}${courseListPath}`, sessionId, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });

        if (!res.body.startsWith("{")) {
            throw new Error(`\u8bfe\u7a0b\u5217\u8868\u8fd4\u56de\u5f02\u5e38: ${res.body.slice(0, 200)}`);
        }

        const json = JSON.parse(res.body);
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

    return { courses: allCourses, categoryUrl: categoryPath };
}

// ─── Submit One Course ────────────────────────────────────────

async function orderCourseViaProxy(
    sessionId: string,
    kcrwdm: string,
    kcmc: string,
    categoryPath: string,
    hlct: number = 0,
): Promise<{ code: number; message: string }> {
    const addPath = `${categoryPath}/add`;
    const body = new URLSearchParams({ kcrwdm, kcmc, qz: "-1", xxyqdm: "", hlct: String(hlct) });

    let res;
    if (activeProxyUrl) {
        try {
            res = await enrollProxyFetch(`${ZHJW}${addPath}`, sessionId, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
        } catch {
            res = await proxyFetch(`${ZHJW}${addPath}`, sessionId, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
        }
    } else {
        res = await proxyFetch(`${ZHJW}${addPath}`, sessionId, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
    }

    try {
        return JSON.parse(res.body);
    } catch {
        return { code: -1, message: `\u975e JSON: ${res.body.slice(0, 100)}` };
    }
}

// ─── Enrollment Job ───────────────────────────────────────────

export async function enrollJobViaProxy(
    preferences: (number | null)[],
    courses: CourseItem[],
    categoryPath: string,
    sessionId: string,
    logger: LogCallback,
): Promise<EnrollResult> {
    const validOrders: number[] = [];
    for (const pref of preferences) {
        if (pref === null || pref === undefined) continue;
        if (pref < 1 || pref > courses.length) continue;
        if (!validOrders.includes(pref)) validOrders.push(pref);
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
            const result = await orderCourseViaProxy(sessionId, course.kcrwdm, course.kcmc, categoryPath);
            const msg = result.message || "";
            lastMessage = msg || JSON.stringify(result);

            if (result.code === 0 || msg === "您已经选了该门课程") {
                logger({ type: "success", course: course.kcmc, message: `选课成功：${course.kcmc}` });
                return { success: true, message: `选课成功：${course.kcmc}`, courseName: course.kcmc };
            }

            if (msg === "超出选课要求门数(1.0门)") {
                logger({ type: "success", message: "已达到选课上限" });
                return { success: true, message: "已达到选课上限" };
            }

            // 检测冲突提示，自动确认（模拟点击弹窗"确定"按钮）
            if (msg.includes("冲突")) {
                logger({ type: "info", message: `检测到冲突提示，自动确认: ${msg}` });
                try {
                    const confirmResult = await orderCourseViaProxy(sessionId, course.kcrwdm, course.kcmc, categoryPath, 1);
                    const confirmMsg = confirmResult.message || "";
                    lastMessage = confirmMsg || JSON.stringify(confirmResult);
                    if (confirmResult.code === 0 || confirmMsg === "您已经选了该门课程") {
                        logger({ type: "success", course: course.kcmc, message: `选课成功（忽略冲突）：${course.kcmc}` });
                        return { success: true, message: `选课成功（忽略冲突）：${course.kcmc}`, courseName: course.kcmc };
                    }
                    if (confirmMsg === "超出选课要求门数(1.0门)") {
                        logger({ type: "success", message: "已达到选课上限" });
                        return { success: true, message: "已达到选课上限" };
                    }
                    logger({ type: "info", message: `确认冲突后仍失败: ${lastMessage}` });
                } catch (confirmErr) {
                    logger({ type: "error", message: `确认冲突请求异常: ${confirmErr instanceof Error ? confirmErr.message : String(confirmErr)}` });
                }
                continue;
            }

            if (i % 5 === 0) {
                logger({ type: "info", message: `服务器: ${msg}` });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            lastMessage = `异常: ${errMsg}`;
            if (i % 5 === 0) logger({ type: "error", message: lastMessage });
        }

        // Wait with random jitter between attempts
        if (i < MAX_ATTEMPTS - 1) {
            const delay = ATTEMPT_DELAY_MIN + Math.random() * (ATTEMPT_DELAY_MAX - ATTEMPT_DELAY_MIN);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    logger({ type: "fail", message: `${MAX_ATTEMPTS}次后未成功: ${lastMessage}` });
    return { success: false, message: `抢课失败: ${lastMessage}` };
}

// ─── Time Calibration ─────────────────────────────────────────

export async function calibrateTimeViaProxy(sessionId: string): Promise<number> {
    let bestDiff = 0;
    let bestRtt = Infinity;

    for (let i = 0; i < 3; i++) {
        const before = Date.now();
        try {
            const res = await proxyFetch(`${ZHJW}${WELCOME_PATH}`, sessionId, {
                headers: { Accept: "text/html,*/*" },
            });
            const after = Date.now();
            if (!res.dateHeader) continue;

            const serverTime = new Date(res.dateHeader).getTime();
            const rtt = after - before;
            const localEstimate = before + rtt / 2;
            const diff = serverTime - localEstimate;

            if (rtt < bestRtt) { bestRtt = rtt; bestDiff = diff; }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 30));
    }

    return bestDiff;
}

// ─── Compute Run-At ───────────────────────────────────────────

export function computeRunAt(timeStr: string, timeDiffMs: number, sendAheadMs = 50): number {
    const [h, m, s] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
    const targetLocal = target.getTime() - timeDiffMs - sendAheadMs;

    if (targetLocal <= Date.now()) {
        return targetLocal + 24 * 60 * 60 * 1000;
    }
    return targetLocal;
}
