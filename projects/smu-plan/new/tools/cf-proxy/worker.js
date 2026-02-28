/**
 * SMU Reverse Proxy — Cloudflare Worker
 *
 * Routes:
 *   /uis/*  → https://uis.smu.edu.cn/*
 *   /zhjw/* → https://zhjw.smu.edu.cn/*
 *
 * Adds CORS headers so the browser can call directly.
 * Transparently forwards cookies and headers.
 */

const TARGETS = {
    "/uis/": "https://uis.smu.edu.cn/",
    "/zhjw/": "https://zhjw.smu.edu.cn/",
};

// Allowed origin(s)
const ALLOWED_ORIGINS = [
    "https://nanyee.de",
    "https://www.nanyee.de",
];

function getAllowedOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    // Allow any localhost / 127.0.0.1 port for dev
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    return ALLOWED_ORIGINS[0];
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return handlePreflight(request);
        }

        // Find matching target
        let targetBase = null;
        let prefix = null;
        for (const [p, base] of Object.entries(TARGETS)) {
            if (url.pathname.startsWith(p)) {
                prefix = p;
                targetBase = base;
                break;
            }
        }

        if (!targetBase) {
            return new Response(
                JSON.stringify({ error: "Unknown path. Use /uis/* or /zhjw/*" }),
                { status: 404, headers: { "Content-Type": "application/json" } },
            );
        }

        // Build target URL
        const targetPath = url.pathname.slice(prefix.length);
        const targetUrl = targetBase + targetPath + url.search;

        // Build forwarded headers
        const headers = new Headers();
        // Copy relevant headers from the original request
        const forwardHeaders = [
            "content-type",
            "accept",
            "accept-language",
            "x-requested-with",
            "origin",
            "referer",
        ];
        for (const h of forwardHeaders) {
            const val = request.headers.get(h);
            if (val) headers.set(h, val);
        }

        // Forward cookies from the custom header (browsers won't send cross-origin cookies)
        const cookieHeader = request.headers.get("X-Cookie");
        if (cookieHeader) {
            headers.set("Cookie", cookieHeader);
        }

        // Set proper Host and User-Agent
        const targetHost = new URL(targetBase).host;
        headers.set("Host", targetHost);
        headers.set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        );

        // Fix Origin/Referer to look like they come from the target
        if (prefix === "/zhjw/") {
            headers.set("Origin", "https://zhjw.smu.edu.cn");
            headers.set("Referer", "https://zhjw.smu.edu.cn/");
        } else if (prefix === "/uis/") {
            headers.set("Origin", "https://uis.smu.edu.cn");
            headers.set("Referer", "https://uis.smu.edu.cn/login.jsp");
        }

        // Forward request
        let proxyRes;
        try {
            proxyRes = await fetch(targetUrl, {
                method: request.method,
                headers,
                body: request.method !== "GET" && request.method !== "HEAD"
                    ? await request.arrayBuffer()
                    : undefined,
                redirect: "manual",
            });
        } catch (err) {
            // Upstream unreachable — return error WITH CORS headers
            const allowedOrigin = getAllowedOrigin(request);
            return new Response(
                JSON.stringify({ error: `Upstream error: ${err.message}`, target: targetUrl }),
                {
                    status: 502,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": allowedOrigin,
                        "Access-Control-Allow-Credentials": "true",
                    },
                },
            );
        }

        // Build response with CORS headers
        const resHeaders = new Headers();

        // Copy response headers
        for (const [key, value] of proxyRes.headers.entries()) {
            // Skip headers that conflict with CORS
            if (key.toLowerCase() === "access-control-allow-origin") continue;
            resHeaders.append(key, value);
        }

        // Expose Set-Cookie via a custom header (browsers block Set-Cookie on cross-origin)
        const setCookies = proxyRes.headers.getAll
            ? proxyRes.headers.getAll("set-cookie")
            : [proxyRes.headers.get("set-cookie")].filter(Boolean);
        if (setCookies.length > 0) {
            resHeaders.set("X-Set-Cookie", JSON.stringify(setCookies));
        }

        // Expose Location header for redirects
        const location = proxyRes.headers.get("location");
        if (location) {
            resHeaders.set("X-Location", location);
        }

        // Add CORS headers
        const allowedOrigin = getAllowedOrigin(request);
        resHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
        resHeaders.set("Access-Control-Allow-Credentials", "true");
        resHeaders.set(
            "Access-Control-Expose-Headers",
            "X-Set-Cookie, X-Location, Content-Type, Date",
        );

        return new Response(proxyRes.body, {
            status: proxyRes.status,
            headers: resHeaders,
        });
    },
};

function handlePreflight(request) {
    const allowedOrigin = getAllowedOrigin(request);

    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, X-Cookie, X-Requested-With, Accept, Accept-Language",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Max-Age": "86400",
        },
    });
}
