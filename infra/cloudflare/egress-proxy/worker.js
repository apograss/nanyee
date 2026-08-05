// nanyee-egress-proxy — 学校侧流量的锁定版转发代理
//
// 目的：让后端对 uis/zhjw/infospace.smu.edu.cn 的出站请求走 Cloudflare 边缘 IP 池，
// 避免学校按来源 IP 限流/封禁（抢课等高并发场景）。
//
// 安全约束：
// - 必须携带 X-Proxy-Token（plain_text 绑定 PROXY_TOKEN，随部署写入）
// - 目标仅允许 ALLOWED_HOSTS 白名单、且仅 https
// - 剥离 cf-* / x-forwarded-for 等会暴露调用方的头
// - 重定向不跟随（redirect: "manual"），302 原样回传，由调用方按协议处理
// - Set-Cookie 通过 getSetCookie() 逐条透传，不合并
//
// 协议：任意 method；X-Proxy-Target 头携带完整目标 URL；其余头与 body 原样转发。
const ALLOWED_HOSTS = new Set([
  "uis.smu.edu.cn",
  "zhjw.smu.edu.cn",
  "infospace.smu.edu.cn",
]);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_HEADER_DENY = new Set([
  "host",
  "x-proxy-token",
  "x-proxy-target",
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "cdn-loop",
]);

export default {
  async fetch(request, env) {
    const expected = env.PROXY_TOKEN;
    if (!expected || request.headers.get("x-proxy-token") !== expected) {
      return new Response("forbidden", { status: 403 });
    }
    const targetHeader = request.headers.get("x-proxy-target");
    if (!targetHeader) {
      return new Response("missing x-proxy-target", { status: 400 });
    }
    let target;
    try {
      target = new URL(targetHeader);
    } catch {
      return new Response("invalid x-proxy-target", { status: 400 });
    }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
      return new Response("host not allowed", { status: 403 });
    }

    const headers = new Headers();
    for (const [name, value] of request.headers) {
      const lower = name.toLowerCase();
      if (REQUEST_HEADER_DENY.has(lower) || lower.startsWith("cf-")) continue;
      headers.set(name, value);
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });

    const outHeaders = new Headers();
    for (const [name, value] of upstream.headers) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower) || lower === "set-cookie" || lower === "content-length") continue;
      outHeaders.append(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      outHeaders.append("set-cookie", cookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  },
};
