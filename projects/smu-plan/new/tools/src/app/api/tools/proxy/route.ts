import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/tools/proxy
 *
 * Server-side proxy for UIS and ZHJW requests.
 * Replaces the CF Worker proxy when it can't reach Chinese university servers.
 *
 * Body JSON: {
 *   url: string,       // target URL (e.g. "https://uis.smu.edu.cn/login/login.do")
 *   method?: string,   // default "GET"
 *   headers?: Record<string,string>,
 *   body?: string,
 *   cookies?: string[], // cookies to forward
 * }
 *
 * Returns: {
 *   status: number,
 *   body: string,
 *   cookies: string[],  // Set-Cookie values from response
 *   location?: string,  // Location header for redirects
 *   dateHeader?: string,
 * }
 */

const ALLOWED_HOSTS = ["uis.smu.edu.cn", "zhjw.smu.edu.cn"];

function cookieString(cookies: string[]): string {
    return cookies.map((c) => c.split(";")[0]).join("; ");
}

export async function POST(request: NextRequest) {
    try {
        const req = await request.json();
        const { url, method = "GET", headers = {}, body, cookies = [] } = req;

        if (!url) {
            return NextResponse.json({ error: "Missing url" }, { status: 400 });
        }

        // Security: only allow proxying to known hosts
        const targetUrl = new URL(url);
        if (!ALLOWED_HOSTS.includes(targetUrl.host)) {
            return NextResponse.json(
                { error: `Host not allowed: ${targetUrl.host}` },
                { status: 403 },
            );
        }

        // Build request headers
        const fwdHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            ...headers,
        };

        if (cookies.length > 0) {
            fwdHeaders["Cookie"] = cookieString(cookies);
        }

        // Set proper Host
        fwdHeaders["Host"] = targetUrl.host;

        // Fix Origin/Referer
        if (targetUrl.host === "zhjw.smu.edu.cn") {
            fwdHeaders["Origin"] = "https://zhjw.smu.edu.cn";
            fwdHeaders["Referer"] = "https://zhjw.smu.edu.cn/";
        } else if (targetUrl.host === "uis.smu.edu.cn") {
            fwdHeaders["Origin"] = "https://uis.smu.edu.cn";
            fwdHeaders["Referer"] = "https://uis.smu.edu.cn/login.jsp";
        }

        const res = await fetch(url, {
            method,
            headers: fwdHeaders,
            body: method !== "GET" && method !== "HEAD" ? body : undefined,
            redirect: "manual",
        });

        const resBody = await res.text();

        // Collect Set-Cookie headers
        const setCookies: string[] = [];
        res.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") {
                setCookies.push(value);
            }
        });

        return NextResponse.json({
            status: res.status,
            body: resBody,
            cookies: setCookies,
            location: res.headers.get("location") || undefined,
            dateHeader: res.headers.get("date") || undefined,
        });
    } catch (err) {
        console.error("[proxy] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Proxy request failed" },
            { status: 500 },
        );
    }
}
