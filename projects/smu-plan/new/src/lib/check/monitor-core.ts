import { createHash } from "node:crypto";

export type AccountStatus = "healthy" | "rate_limited" | "invalid" | "stale" | "unknown";

export interface ParsedGrokAccount {
  accountKey: string;
  email: string;
  password: string;
  sso: string | null;
  ssoRw: string | null;
  displayLabelMasked: string;
}

export interface ParsedGrokTokenState {
  accountKey: string;
  displayLabelMasked: string;
  status: AccountStatus;
  quota: number;
  rawStatus: string | null;
  lastFailReason: string | null;
  lastUsedAt: Date | null;
  lastSyncAt: Date | null;
  lastObservedAt: Date | null;
  createdAt: Date | null;
  useCount: number;
}

export interface ObservedAccountSignal {
  lastSuccessAt: Date | null;
  lastObservedAt: Date | null;
  lastError: string | null;
  requestCount24h: number;
  successCount24h: number;
}

const CHECK_HOST = "check.nanyee.de";
const INTERNAL_PREFIX = "/check-internal";
const STATIC_PREFIXES = ["/_next", "/favicon", "/robots", "/sitemap", "/assets"];

export function rewriteCheckPath(pathWithQuery: string, host: string | null | undefined): string | null {
  if (!host) return null;
  const normalizedHost = host.split(":")[0]?.toLowerCase();
  if (normalizedHost !== CHECK_HOST) return null;
  if (pathWithQuery.startsWith(INTERNAL_PREFIX)) return null;
  if (pathWithQuery.startsWith("/api/")) return null;
  if (STATIC_PREFIXES.some((prefix) => pathWithQuery.startsWith(prefix))) return null;

  if (pathWithQuery === "/") return INTERNAL_PREFIX;
  return `${INTERNAL_PREFIX}${pathWithQuery}`;
}

export function parseGrokAccounts(raw: string): ParsedGrokAccount[] {
  const blocks = raw
    .split(/-{20,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const accounts: ParsedGrokAccount[] = [];
  for (const block of blocks) {
    const email = matchField(block, "Email");
    const password = matchField(block, "Password");
    if (!email || !password) continue;

    accounts.push({
      accountKey: stableAccountKey("grok", email),
      email,
      password,
      sso: matchField(block, "SSO"),
      ssoRw: matchField(block, "SSO-RW"),
      displayLabelMasked: maskEmail(email),
    });
  }

  return dedupeBy(accounts, (account) => account.accountKey);
}

export function parseGrokTokenStates(raw: string): ParsedGrokTokenState[] {
  const parsed = JSON.parse(raw) as {
    ssoBasic?: Array<{
      email?: string;
      note?: string;
      token?: string;
      quota?: number;
      status?: string;
      last_fail_reason?: string | null;
      last_used_at?: number | string | null;
      last_sync_at?: number | string | null;
      created_at?: number | string | null;
      use_count?: number;
    }>;
    ssoSuper?: Array<{
      email?: string;
      note?: string;
      token?: string;
      quota?: number;
      status?: string;
      last_fail_reason?: string | null;
      last_used_at?: number | string | null;
      last_sync_at?: number | string | null;
      created_at?: number | string | null;
      use_count?: number;
    }>;
  };

  const items = [...(parsed.ssoBasic ?? []), ...(parsed.ssoSuper ?? [])];
  const states: ParsedGrokTokenState[] = [];

  for (const item of items) {
    const email = item.email?.trim();
    const note = item.note?.trim();
    const token = item.token?.trim();
    const quota = typeof item.quota === "number" ? item.quota : 0;
    const rawStatus = item.status?.trim().toLowerCase() ?? null;
    const lastFailReason = item.last_fail_reason?.trim() || null;
    const lastUsedAt = parseEpochLike(item.last_used_at);
    const lastSyncAt = parseEpochLike(item.last_sync_at);
    const createdAt = parseEpochLike(item.created_at);
    const status = classifyGrokTokenState({
      quota,
      rawStatus,
      lastFailReason,
      hasObservation: Boolean(lastSyncAt || lastUsedAt),
    });
    const displayLabelMasked = email
      ? maskEmail(email)
      : note || `grok-token-${createOpaqueAccountKey(token || JSON.stringify(item)).slice(0, 8)}`;
    const accountKey = email
      ? stableAccountKey("grok", email)
      : createOpaqueAccountKey(token || note || JSON.stringify(item));

    states.push({
      accountKey,
      displayLabelMasked,
      status,
      quota,
      rawStatus,
      lastFailReason,
      lastUsedAt,
      lastSyncAt,
      lastObservedAt: lastSyncAt ?? createdAt,
      createdAt,
      useCount: typeof item.use_count === "number" ? item.use_count : 0,
    });
  }

  return dedupeBy(states, (item) => item.accountKey);
}

export function classifyGrokTokenState(input: {
  quota: number;
  rawStatus: string | null;
  lastFailReason?: string | null;
  hasObservation?: boolean;
}): AccountStatus {
  const normalizedStatus = input.rawStatus ?? "";
  const normalizedFailReason = input.lastFailReason?.toLowerCase() ?? "";

  if (normalizedFailReason) {
    if (INVALID_PATTERNS.some((pattern) => normalizedFailReason.includes(pattern))) {
      return "invalid";
    }

    if (RATE_LIMIT_PATTERNS.some((pattern) => normalizedFailReason.includes(pattern))) {
      return "rate_limited";
    }
  }

  if (normalizedStatus && INVALID_PATTERNS.some((pattern) => normalizedStatus.includes(pattern))) {
    return "invalid";
  }

  if (normalizedStatus === "inactive" || normalizedStatus === "disabled" || normalizedStatus === "banned") {
    return "invalid";
  }

  if (input.quota <= 0) {
    return "rate_limited";
  }

  if (normalizedStatus === "active") {
    if (input.hasObservation === false) {
      return "unknown";
    }
    return "healthy";
  }

  return "unknown";
}

export function classifyAccountStatus(signal: ObservedAccountSignal, now = new Date()): AccountStatus {
  const normalizedError = signal.lastError?.toLowerCase() ?? "";
  if (normalizedError) {
    if (INVALID_PATTERNS.some((pattern) => normalizedError.includes(pattern))) return "invalid";
    if (RATE_LIMIT_PATTERNS.some((pattern) => normalizedError.includes(pattern))) return "rate_limited";
  }

  if (signal.lastSuccessAt && now.getTime() - signal.lastSuccessAt.getTime() <= DAY_MS) {
    return "healthy";
  }

  if (signal.lastObservedAt && now.getTime() - signal.lastObservedAt.getTime() > DAY_MS && !signal.lastError) {
    return "stale";
  }

  if (signal.requestCount24h > 0 && signal.successCount24h === 0 && !signal.lastError) {
    return "stale";
  }

  return "unknown";
}

export function stableAccountKey(provider: "chatgpt" | "grok" | "qwen" | "longcat", rawIdentifier: string): string {
  return createHash("sha256").update(`${provider}:${rawIdentifier.trim().toLowerCase()}`).digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 4) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 4)}***@${domain}`;
}

function matchField(block: string, field: string): string | null {
  const pattern = new RegExp(`^${field}:\\s*(.+)$`, "im");
  return block.match(pattern)?.[1]?.trim() ?? null;
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function createOpaqueAccountKey(rawIdentifier: string): string {
  return createHash("sha256").update(`grok-token:${rawIdentifier}`).digest("hex");
}

function parseEpochLike(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_PATTERNS = ["token_invalidated", "unauthorized", "invalid", "forbidden", "auth_unavailable"];
const RATE_LIMIT_PATTERNS = ["rate limit", "quota", "too many requests", "429"];
