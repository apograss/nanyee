import { NextResponse } from "next/server";

/**
 * POST /api/tools/sso-redirect
 *
 * Follows the SSO redirect chain from UIS to ZHJW locally (server-side).
 * The CF Worker can reach uis.smu.edu.cn but sometimes can't reach
 * zhjw.smu.edu.cn. This endpoint runs on the local Next.js server
 * (which is in China and can reach ZHJW reliably).
 *
 * Body: { ticket: string, cookies: string[] }
 * Returns: { cookies: string[] }
 */

const ZHJW = "https://zhjw.smu.edu.cn";

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

export async function POST(request: Request) {
    try {
        const { ticket, cookies: inputCookies } = await request.json();

        if (!ticket) {
            return NextResponse.json({ error: "Missing ticket" }, { status: 400 });
        }

        let currentPath = `/new/ssoLogin?ticket=${encodeURIComponent(ticket)}`;
        let cookies: string[] = inputCookies || [];

        console.log("[sso-redirect] Starting SSO redirect chain...");

        for (let i = 0; i < 5; i++) {
            const url = `${ZHJW}${currentPath}`;
            console.log(`[sso-redirect] Step ${i + 1}: ${url}`);

            const res = await fetch(url, {
                headers: {
                    Accept: "text/html,*/*",
                    Cookie: cookieString(cookies),
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                redirect: "manual",
            });

            // Collect set-cookie headers
            const setCookieHeaders: string[] = [];
            res.headers.forEach((value, key) => {
                if (key.toLowerCase() === "set-cookie") {
                    setCookieHeaders.push(value);
                }
            });
            cookies = mergeCookies(cookies, setCookieHeaders);

            const location = res.headers.get("location");
            if (!location) {
                console.log("[sso-redirect] No more redirects");
                break;
            }

            console.log(`[sso-redirect] → Location: ${location}`);
            if (location.startsWith("http")) {
                if (location.includes("zhjw.smu.edu.cn")) {
                    currentPath = location.replace("https://zhjw.smu.edu.cn", "");
                } else {
                    console.log("[sso-redirect] External redirect, stopping");
                    break;
                }
            } else {
                currentPath = location;
            }
        }

        console.log(`[sso-redirect] Done. Collected ${cookies.length} cookies`);

        return NextResponse.json({ cookies });
    } catch (err) {
        console.error("[sso-redirect] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "SSO redirect failed" },
            { status: 500 },
        );
    }
}
