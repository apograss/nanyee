/**
 * SMU UIS SSO authentication — TypeScript rewrite of smulogin.py
 *
 * Flow:
 *   1. GET captcha image from UIS (returns image buffer + cookies)
 *   2. POST login with {学号, MD5(密码), 验证码} → get ticket
 *   3. GET zhjw ssoLogin?ticket=xxx → establish academic session
 */

import { createHash } from "crypto";

const UIS_BASE = "https://uis.smu.edu.cn";
const ZHJW_BASE = "https://zhjw.smu.edu.cn";

const COMMON_HEADERS: Record<string, string> = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
};

/** Extract Set-Cookie values from a Response */
function extractCookies(res: Response): string[] {
    const raw = res.headers.getSetCookie?.() ?? [];
    return raw;
}

/** Build a Cookie header string from an array of Set-Cookie values */
function buildCookieHeader(cookies: string[]): string {
    return cookies
        .map((c) => c.split(";")[0]) // take only name=value
        .join("; ");
}

/** Merge new cookies into existing ones (update existing, add new) */
function mergeCookies(existing: string[], incoming: string[]): string[] {
    const map = new Map<string, string>();
    for (const c of [...existing, ...incoming]) {
        const nameVal = c.split(";")[0];
        const name = nameVal.split("=")[0].trim();
        map.set(name, c);
    }
    return Array.from(map.values());
}

// ─── Step 1: Fetch Captcha ────────────────────────────────────────

export interface CaptchaResult {
    imageBase64: string; // data:image/jpeg;base64,...
    cookies: string[];   // UIS session cookies to carry forward
    imageBuffer: Buffer; // raw image bytes for server-side OCR
}

export async function fetchCaptcha(): Promise<CaptchaResult> {
    const res = await fetch(`${UIS_BASE}/imageServlet.do`, {
        headers: {
            ...COMMON_HEADERS,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            Referer: `${UIS_BASE}/login.jsp?outLine=0`,
        },
        redirect: "manual",
    });

    const cookies = extractCookies(res);
    const buffer = Buffer.from(await res.arrayBuffer());
    const imageBase64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;

    return { imageBase64, cookies, imageBuffer: buffer };
}

// ─── Step 2: Login → Ticket ───────────────────────────────────────

export async function login(
    account: string,
    password: string,
    captcha: string,
    uisCookies: string[],
): Promise<{ ticket: string; cookies: string[] }> {
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

    const res = await fetch(`${UIS_BASE}/login/login.do`, {
        method: "POST",
        headers: {
            ...COMMON_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Cookie: buildCookieHeader(uisCookies),
            Origin: UIS_BASE,
            Referer: `${UIS_BASE}/login.jsp?redirect=https%3A%2F%2Fzhjw.smu.edu.cn%2Fnew%2FssoLogin`,
            "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
        redirect: "manual",
    });

    const text = await res.text();

    if (res.status !== 200 || !text.includes("成功")) {
        // Try to parse as JSON for error message
        let errorMsg = "登录失败";
        try {
            const json = JSON.parse(text);
            errorMsg = json.message || json.msg || "登录失败，请检查学号、密码和验证码";
        } catch {
            errorMsg = `登录失败: ${text.slice(0, 200)}`;
        }
        throw new Error(errorMsg);
    }

    const json = JSON.parse(text);
    const ticket = json.ticket as string;
    if (!ticket) throw new Error("登录成功但未获取到 ticket");

    const newCookies = mergeCookies(uisCookies, extractCookies(res));
    return { ticket, cookies: newCookies };
}

// ─── Step 3: Ticket → Academic Session ────────────────────────────

export async function establishSession(
    ticket: string,
): Promise<string[]> {
    const url = new URL(`${ZHJW_BASE}/new/ssoLogin`);
    url.searchParams.set("ticket", ticket);

    let currentUrl = url.toString();
    let cookies: string[] = [];

    // Follow redirects manually (up to 5 hops) to collect ALL cookies
    for (let i = 0; i < 5; i++) {
        const res = await fetch(currentUrl, {
            headers: {
                ...COMMON_HEADERS,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                Cookie: buildCookieHeader(cookies),
                Host: "zhjw.smu.edu.cn",
                Referer: `${ZHJW_BASE}/`,
            },
            redirect: "manual",
        });

        cookies = mergeCookies(cookies, extractCookies(res));

        const location = res.headers.get("location");
        if (!location) break; // No more redirects

        currentUrl = location.startsWith("http")
            ? location
            : `${ZHJW_BASE}${location}`;
    }

    if (cookies.length === 0) {
        throw new Error("建立教务系统会话失败：未获取到任何 cookie");
    }

    return cookies;
}

// ─── Full Login Flow ──────────────────────────────────────────────

export async function fullLogin(
    account: string,
    password: string,
    captcha: string,
    uisCookies: string[],
): Promise<string[]> {
    const { ticket } = await login(account, password, captcha, uisCookies);
    const zhjwCookies = await establishSession(ticket);
    return zhjwCookies;
}
