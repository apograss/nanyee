import { NextRequest, NextResponse } from "next/server";

import { requireUser, handleAuthError } from "@/lib/auth/guard";
import { getSession, replaceSession } from "@/lib/session-store";

const ALLOWED_HOSTS = ["uis.smu.edu.cn", "zhjw.smu.edu.cn"];
const ALLOWED_PROXY_BASES = [
  "http://119.29.161.78:8080",
  "http://104.248.158.12:8080",
];

function cookieString(cookies: string[]): string {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function mergeCookies(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...existing, ...incoming]) {
    const nameVal = c.split(";")[0];
    const name = nameVal.split("=")[0].trim();
    map.set(name, c);
  }
  return Array.from(map.values());
}

async function fetchDirect(
  targetUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  cookies: string[],
) {
  const fwdHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ...headers,
  };

  if (cookies.length > 0) {
    fwdHeaders.Cookie = cookieString(cookies);
  }

  fwdHeaders.Host = targetUrl.host;

  if (targetUrl.host === "zhjw.smu.edu.cn") {
    fwdHeaders.Origin = "https://zhjw.smu.edu.cn";
    fwdHeaders.Referer = "https://zhjw.smu.edu.cn/";
  } else if (targetUrl.host === "uis.smu.edu.cn") {
    fwdHeaders.Origin = "https://uis.smu.edu.cn";
    fwdHeaders.Referer = "https://uis.smu.edu.cn/login.jsp";
  }

  const res = await fetch(targetUrl.toString(), {
    method,
    headers: fwdHeaders,
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
    redirect: "manual",
  });

  const resBody = await res.text();
  const setCookies: string[] = [];
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookies.push(value);
    }
  });

  return {
    status: res.status,
    body: resBody,
    cookies: setCookies,
    location: res.headers.get("location") || undefined,
    dateHeader: res.headers.get("date") || undefined,
  };
}

async function fetchViaExternalProxy(
  proxyBaseUrl: string,
  targetUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  cookies: string[],
) {
  if (!ALLOWED_PROXY_BASES.includes(proxyBaseUrl)) {
    throw new Error(`Proxy base not allowed: ${proxyBaseUrl}`);
  }

  let proxyPath = "";
  if (targetUrl.host === "zhjw.smu.edu.cn") {
    proxyPath = `/zhjw${targetUrl.pathname}${targetUrl.search}`;
  } else if (targetUrl.host === "uis.smu.edu.cn") {
    proxyPath = `/uis${targetUrl.pathname}${targetUrl.search}`;
  } else {
    throw new Error(`Host not allowed: ${targetUrl.host}`);
  }

  const proxyUrl = `${proxyBaseUrl}${proxyPath}`;
  const res = await fetch(proxyUrl, {
    method,
    headers: {
      "X-Cookie": cookieString(cookies),
      ...headers,
    },
    body: method !== "GET" && method !== "HEAD" ? body : undefined,
    redirect: "manual",
  });

  const resBody = await res.text();
  let setCookies: string[] = [];
  const xSetCookie = res.headers.get("X-Set-Cookie");
  if (xSetCookie) {
    try {
      setCookies = JSON.parse(xSetCookie);
    } catch {
      setCookies = [];
    }
  }

  return {
    status: res.status,
    body: resBody,
    cookies: setCookies,
    location: res.headers.get("X-Location") || undefined,
    dateHeader: res.headers.get("date") || undefined,
  };
}

/**
 * POST /api/tools/proxy
 *
 * Body JSON:
 * {
 *   url: string,
 *   method?: string,
 *   headers?: Record<string, string>,
 *   body?: string,
 *   sessionId?: string,
 *   proxyBaseUrl?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const req = await request.json();
    const {
      url,
      method = "GET",
      headers = {},
      body,
      sessionId,
      proxyBaseUrl,
    } = req as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      sessionId?: string;
      proxyBaseUrl?: string;
    };

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const targetUrl = new URL(url);
    if (!ALLOWED_HOSTS.includes(targetUrl.host)) {
      return NextResponse.json(
        { error: `Host not allowed: ${targetUrl.host}` },
        { status: 403 },
      );
    }

    const currentCookies = getSession(sessionId);
    if (!currentCookies) {
      return NextResponse.json(
        { error: "登录会话已过期，请重新获取验证码。" },
        { status: 400 },
      );
    }

    const result = proxyBaseUrl
      ? await fetchViaExternalProxy(proxyBaseUrl, targetUrl, method, headers, body, currentCookies)
      : await fetchDirect(targetUrl, method, headers, body, currentCookies);

    replaceSession(sessionId, mergeCookies(currentCookies, result.cookies));

    return NextResponse.json({
      status: result.status,
      body: result.body,
      location: result.location,
      dateHeader: result.dateHeader,
    });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse.status === 401 || authResponse.status === 403) {
      return authResponse;
    }
    console.error("[proxy] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy request failed" },
      { status: 500 },
    );
  }
}
