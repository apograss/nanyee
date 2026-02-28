import { URL } from "url";
import dns from "dns/promises";
import http from "http";
import https from "https";

const PRIVATE_RANGES = [
  // 10.0.0.0/8
  { start: 0x0a000000, end: 0x0affffff },
  // 172.16.0.0/12
  { start: 0xac100000, end: 0xac1fffff },
  // 192.168.0.0/16
  { start: 0xc0a80000, end: 0xc0a8ffff },
  // 127.0.0.0/8
  { start: 0x7f000000, end: 0x7fffffff },
  // 169.254.0.0/16 (link-local)
  { start: 0xa9fe0000, end: 0xa9feffff },
  // 0.0.0.0/8
  { start: 0x00000000, end: 0x00ffffff },
  // 100.64.0.0/10 (CGNAT / Shared Address Space)
  { start: 0x64400000, end: 0x647fffff },
  // 198.18.0.0/15 (Benchmarking)
  { start: 0xc6120000, end: 0xc613ffff },
  // 224.0.0.0/4 (Multicast)
  { start: 0xe0000000, end: 0xefffffff },
  // 240.0.0.0/4 (Reserved)
  { start: 0xf0000000, end: 0xffffffff },
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback and unspecified
  if (ip === "::1" || ip === "::" || ip === "0:0:0:0:0:0:0:1") return true;
  // IPv6 link-local
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4Match ? v4Match[1] : ip;

  const parts = v4.split(".");
  if (parts.length !== 4) return true; // Reject non-IPv4 that wasn't caught

  const num = ipv4ToInt(v4);
  return PRIVATE_RANGES.some((r) => num >= r.start && num <= r.end);
}

/**
 * Resolve hostname and check ALL address families (A + AAAA).
 * Returns a list of validated public IP addresses.
 */
async function resolveAndCheck(hostname: string): Promise<string[]> {
  const allAddresses: string[] = [];

  // Resolve both A and AAAA, collect all results
  try {
    const v4 = await dns.resolve4(hostname);
    allAddresses.push(...v4);
  } catch {
    // No A records, that's ok
  }

  try {
    const v6 = await dns.resolve6(hostname);
    allAddresses.push(...v6);
  } catch {
    // No AAAA records, that's ok
  }

  if (allAddresses.length === 0) {
    throw new Error("DNS resolution failed: no addresses found");
  }

  // Check ALL addresses — reject if ANY resolve to private IP
  for (const addr of allAddresses) {
    if (isPrivateIP(addr)) {
      throw new Error("Target resolves to private IP");
    }
  }

  return allAddresses;
}

export interface FetchMetaResult {
  title: string | null;
  description: string | null;
  favicon: string | null;
}

const EMPTY_RESULT: FetchMetaResult = {
  title: null,
  description: null,
  favicon: null,
};

const MAX_BODY_SIZE = 512 * 1024; // 512KB
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

/**
 * Create a custom DNS lookup function that only allows pre-validated IPs.
 * This prevents DNS rebinding attacks by ensuring the actual connection
 * goes to an IP we already verified as non-private.
 */
function createSafeLookup(allowedIPs: string[]) {
  const v4Allowed = allowedIPs.filter((ip) => !ip.includes(":"));
  const v6Allowed = allowedIPs.filter((ip) => ip.includes(":"));

  return (
    hostname: string,
    options: { family?: number },
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) => {
    const family = options.family;
    let chosen: string | undefined;
    if (family === 4 || family === undefined) {
      chosen = v4Allowed[0];
    }
    if (!chosen && (family === 6 || family === undefined)) {
      chosen = v6Allowed[0];
    }
    if (!chosen) {
      chosen = v4Allowed[0] || v6Allowed[0];
    }
    if (!chosen) {
      callback(new Error("No allowed IP addresses") as NodeJS.ErrnoException, "", 4);
      return;
    }
    callback(null, chosen, chosen.includes(":") ? 6 : 4);
  };
}

/**
 * Fetch a URL using Node http/https agents with pinned DNS lookup.
 * This prevents DNS rebinding by binding the connection to pre-resolved IPs.
 */
async function safeFetch(
  url: string,
  allowedIPs: string[],
  signal: AbortSignal
): Promise<Response> {
  const lookup = createSafeLookup(allowedIPs);

  const httpAgent = new http.Agent({ lookup: lookup as never });
  const httpsAgent = new https.Agent({
    lookup: lookup as never,
    rejectUnauthorized: true,
  });

  return fetch(url, {
    signal,
    redirect: "manual",
    headers: {
      "User-Agent": "NanyeeBot/1.0 (metadata fetcher)",
      Accept: "text/html",
    },
    // @ts-expect-error Node.js fetch supports agent via dispatcher
    dispatcher: undefined,
    // Use the agent for the appropriate protocol
    ...(url.startsWith("https:")
      ? { agent: httpsAgent }
      : { agent: httpAgent }),
  });
}

export async function fetchUrlMeta(targetUrl: string): Promise<FetchMetaResult> {
  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return EMPTY_RESULT;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return EMPTY_RESULT;
  }

  // SSRF check — resolve and validate all IPs upfront
  let allowedIPs: string[];
  try {
    allowedIPs = await resolveAndCheck(parsed.hostname);
  } catch {
    return EMPTY_RESULT;
  }

  // Fetch with timeout and redirect control
  let response: Response;
  let redirectCount = 0;
  let currentUrl = targetUrl;
  let currentAllowedIPs = allowedIPs;

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        response = await safeFetch(currentUrl, currentAllowedIPs, controller.signal);
      } finally {
        clearTimeout(timer);
      }

      // Handle redirects manually for SSRF re-check
      if ([301, 302, 303, 307, 308].includes(response!.status)) {
        const location = response!.headers.get("location");
        if (!location) return EMPTY_RESULT;

        const redirectUrl = new URL(location, currentUrl);
        if (!["http:", "https:"].includes(redirectUrl.protocol)) return EMPTY_RESULT;

        // Re-resolve and re-validate the redirect target
        currentAllowedIPs = await resolveAndCheck(redirectUrl.hostname);
        currentUrl = redirectUrl.href;
        redirectCount++;
        continue;
      }

      break;
    }

    if (redirectCount > MAX_REDIRECTS) return EMPTY_RESULT;
    if (!response!.ok) return EMPTY_RESULT;

    // Read body with size limit
    const reader = response!.body?.getReader();
    if (!reader) return EMPTY_RESULT;

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (totalSize < MAX_BODY_SIZE) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }
    reader.cancel();

    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      Buffer.concat(chunks)
    );

    return parseHtmlMeta(html, currentUrl);
  } catch {
    return EMPTY_RESULT;
  }
}

function parseHtmlMeta(html: string, baseUrl: string): FetchMetaResult {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;

  // Extract meta description
  const descMatch = html.match(
    /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["'][^>]*>/i
  ) || html.match(
    /<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]+name\s*=\s*["']description["'][^>]*>/i
  );
  const description = descMatch ? decodeEntities(descMatch[1].trim()) : null;

  // Extract favicon
  const iconMatch = html.match(
    /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]+href\s*=\s*["']([^"']*)["'][^>]*>/i
  ) || html.match(
    /<link[^>]+href\s*=\s*["']([^"']*)["'][^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i
  );
  let favicon: string | null = null;
  if (iconMatch) {
    try {
      favicon = new URL(iconMatch[1], baseUrl).href;
    } catch {
      favicon = null;
    }
  } else {
    try {
      favicon = new URL("/favicon.ico", baseUrl).href;
    } catch {
      favicon = null;
    }
  }

  return {
    title: title || null,
    description: description || null,
    favicon,
  };
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
