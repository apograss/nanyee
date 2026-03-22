import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

import { getCheckConfig } from "./config";
import {
  classifyAccountStatus,
  maskEmail,
  parseGrokAccounts,
  parseGrokTokenStates,
  stableAccountKey,
  type AccountStatus,
  type ParsedGrokAccount,
} from "./monitor-core";

type Provider = "qwen" | "longcat";
type ServiceName = "cpa" | "new_api";

interface ServiceHealthRecordInput {
  provider: Provider;
  service: ServiceName;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number | null;
  version: string | null;
  lastError: string | null;
}

interface AccountStateInput {
  provider: Provider;
  accountKey: string;
  displayLabel: string;
  status: AccountStatus;
  lastUsedAt: Date | null;
  lastSuccessAt: Date | null;
  lastObservedAt: Date | null;
  lastError: string | null;
  requestCount24h: number;
  successRate24h: number;
  metadataJson: string | null;
}

interface ProviderSnapshotInput {
  provider: Provider;
  totalAccounts: number;
  healthyAccounts: number;
  rateLimitedAccounts: number;
  invalidAccounts: number;
  staleAccounts: number;
  unknownAccounts: number;
  requests1h: number;
  requests24h: number;
  successRate1h: number;
  successRate24h: number;
}

export interface CollectAiMonitoringResult {
  checkedAt: string;
  serviceCount: number;
  accountCount: number;
  incidentsCreated: number;
}

export async function collectAiMonitoring(now = new Date()): Promise<CollectAiMonitoringResult> {
  const config = getCheckConfig();

  const serviceHealth = await collectServiceHealth(config);
  await prisma.aiServiceHealth.createMany({
    data: serviceHealth.map((item) => ({
      provider: item.provider,
      service: item.service,
      status: item.status,
      latencyMs: item.latencyMs,
      version: item.version,
      lastError: item.lastError,
      checkedAt: now,
    })),
  });

  const [qwenAccounts, longcatAccounts] = await Promise.all([
    collectQwenAccountStates(config, now),
    collectLongcatAccountStates(now),
  ]);
  const allAccounts = [...qwenAccounts, ...longcatAccounts];

  await syncAccountStates("qwen", qwenAccounts);
  await syncAccountStates("longcat", longcatAccounts);

  const providerSnapshots = await buildProviderSnapshots(now, allAccounts);
  await prisma.aiProviderSnapshot.createMany({
    data: providerSnapshots.map((item) => ({
      provider: item.provider,
      capturedAt: now,
      totalAccounts: item.totalAccounts,
      healthyAccounts: item.healthyAccounts,
      rateLimitedAccounts: item.rateLimitedAccounts,
      invalidAccounts: item.invalidAccounts,
      staleAccounts: item.staleAccounts,
      unknownAccounts: item.unknownAccounts,
      requests1h: item.requests1h,
      requests24h: item.requests24h,
      successRate1h: item.successRate1h,
      successRate24h: item.successRate24h,
    })),
  });

  const incidentsCreated = await createIncidents(now, serviceHealth, allAccounts);
  await cleanupOldRecords(now);

  return {
    checkedAt: now.toISOString(),
    serviceCount: serviceHealth.length,
    accountCount: allAccounts.length,
    incidentsCreated,
  };
}

async function collectServiceHealth(config: ReturnType<typeof getCheckConfig>): Promise<ServiceHealthRecordInput[]> {
  return Promise.all([
    checkService({
      provider: "qwen",
      service: "cpa",
      url: config.cpaApiKey ? `${config.cpaBaseUrl}/v1/models` : config.cpaBaseUrl,
      headers: config.cpaApiKey ? { Authorization: `Bearer ${config.cpaApiKey}` } : undefined,
      requiredText: "qwen",
    }),
    checkService({
      provider: "longcat",
      service: "new_api",
      url: config.newApiApiKey ? `${config.newApiBaseUrl}/v1/models` : config.newApiBaseUrl,
      headers: config.newApiApiKey ? { Authorization: `Bearer ${config.newApiApiKey}` } : undefined,
      requiredText: "longcat",
    }),
  ]);
}

async function checkService(options: {
  provider: Provider;
  service: ServiceName;
  url: string;
  headers?: Record<string, string>;
  requiredText?: string;
}): Promise<ServiceHealthRecordInput> {
  const startedAt = Date.now();

  try {
    const response = await fetch(options.url, {
      method: "GET",
      headers: options.headers,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    const body = await safeReadText(response);

    if (response.ok && (!options.requiredText || body.toLowerCase().includes(options.requiredText.toLowerCase()))) {
      return {
        provider: options.provider,
        service: options.service,
        status: "healthy",
        latencyMs,
        version: extractVersion(body),
        lastError: null,
      };
    }

    return {
      provider: options.provider,
      service: options.service,
      status: "degraded",
      latencyMs,
      version: extractVersion(body),
      lastError: truncate(
        response.ok
          ? `${options.service} did not expose ${options.requiredText ?? "expected"} models`
          : `HTTP ${response.status}: ${body || response.statusText}`,
      ),
    };
  } catch (error) {
    return {
      provider: options.provider,
      service: options.service,
      status: "unhealthy",
      latencyMs: Date.now() - startedAt,
      version: null,
      lastError: truncate(error instanceof Error ? error.message : "Unknown error"),
    };
  }
}

async function collectQwenAccountStates(
  config: ReturnType<typeof getCheckConfig>,
  now: Date,
): Promise<AccountStateInput[]> {
  const files = await listFiles(config.chatgptAuthDir, (name) => name.startsWith("qwen-") && name.endsWith(".json"));

  const accounts: AccountStateInput[] = [];
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const json = JSON.parse(raw) as {
        email?: string;
        disabled?: boolean;
        expired?: string;
        last_refresh?: string;
      };
      const stat = await fs.stat(filePath);
      const expiredAt = parseMaybeDate(json.expired);
      const lastRefreshAt = parseMaybeDate(json.last_refresh);
      const lastObservedAt = maxDate([stat.mtime, lastRefreshAt, expiredAt]);

      const signalError =
        json.disabled ? "disabled" : expiredAt && expiredAt.getTime() <= now.getTime() ? "expired" : null;

      let status = classifyAccountStatus(
        {
          lastSuccessAt: lastRefreshAt,
          lastObservedAt,
          lastError: signalError,
          requestCount24h: 0,
          successCount24h: lastRefreshAt && now.getTime() - lastRefreshAt.getTime() <= DAY_MS ? 1 : 0,
        },
        now
      );

      const email = json.email || path.basename(filePath);
      accounts.push({
        provider: "qwen",
        accountKey: stableAccountKey("qwen", email),
        displayLabel: email.includes("@") ? maskEmail(email) : path.basename(filePath),
        status,
        lastUsedAt: lastRefreshAt,
        lastSuccessAt: lastRefreshAt,
        lastObservedAt,
        lastError: signalError,
        requestCount24h: 0,
        successRate24h: status === "healthy" ? 100 : 0,
        metadataJson: JSON.stringify({
          source: "cpa-auth",
          sourceFile: path.basename(filePath),
          emailDomain: email.includes("@") ? email.split("@")[1] : null,
          expiredAt: expiredAt?.toISOString() ?? null,
          lastRefreshAt: lastRefreshAt?.toISOString() ?? null,
        }),
      });
    } catch (error) {
      const label = path.basename(filePath);
      accounts.push({
        provider: "qwen",
        accountKey: stableAccountKey("qwen", label),
        displayLabel: label,
        status: "invalid",
        lastUsedAt: null,
        lastSuccessAt: null,
        lastObservedAt: null,
        lastError: truncate(error instanceof Error ? error.message : "Invalid auth file"),
        requestCount24h: 0,
        successRate24h: 0,
        metadataJson: JSON.stringify({ source: "cpa-auth", sourceFile: label }),
      });
    }
  }

  return accounts;
}

async function collectLongcatAccountStates(
  now: Date,
): Promise<AccountStateInput[]> {
  const keys = await prisma.providerKey.findMany({
    where: { provider: "longcat" },
    include: {
      usages: {
        where: { createdAt: { gte: subtractMs(now, DAY_MS) } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, success: true },
      },
      healthChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        select: { status: true, error: true, checkedAt: true },
      },
    },
  });

  return keys.map((key) => {
    const latestHealth = key.healthChecks[0] ?? null;
    const latestSuccessAt = key.usages.find((usage) => usage.success)?.createdAt ?? null;
    const lastObservedAt = latestHealth?.checkedAt ?? key.lastCheckAt ?? key.updatedAt;
    const requestCount24h = key.usages.length;
    const successCount24h = key.usages.filter((usage) => usage.success).length;

    let status: AccountStatus;
    if (key.status === "disabled") {
      status = "invalid";
    } else if (latestHealth?.status === "rate_limited") {
      status = "rate_limited";
    } else if (latestHealth?.status === "fail" && (key.lastError || latestHealth.error)) {
      status = classifyAccountStatus(
        {
          lastSuccessAt: latestSuccessAt,
          lastObservedAt,
          lastError: key.lastError || latestHealth.error || null,
          requestCount24h,
          successCount24h,
        },
        now,
      );
    } else {
      status = classifyAccountStatus(
        {
          lastSuccessAt: latestSuccessAt,
          lastObservedAt,
          lastError: key.lastError,
          requestCount24h,
          successCount24h,
        },
        now,
      );
    }

    return {
      provider: "longcat" as const,
      accountKey: stableAccountKey("longcat", key.id),
      displayLabel: key.keyPrefix,
      status,
      lastUsedAt: key.usages[0]?.createdAt ?? null,
      lastSuccessAt: latestSuccessAt,
      lastObservedAt,
      lastError: key.lastError || latestHealth?.error || null,
      requestCount24h,
      successRate24h: requestCount24h ? Math.round((successCount24h / requestCount24h) * 100) : 0,
      metadataJson: JSON.stringify({
        source: "provider-key",
        keyPrefix: key.keyPrefix,
        keyStatus: key.status,
        lastCheckAt: key.lastCheckAt?.toISOString() ?? null,
        latestHealthStatus: latestHealth?.status ?? null,
      }),
    };
  });
}

async function readGrokTokenPayload(
  config: ReturnType<typeof getCheckConfig>
): Promise<{ raw: string; source: "grok-admin-api" | "grok-token-file" } | null> {
  const adminPayload = await fetchGrokAdminTokenPayload(config);
  if (adminPayload) {
    return { raw: adminPayload, source: "grok-admin-api" };
  }

  try {
    const raw = await fs.readFile(config.grokTokenFile, "utf8");
    return { raw, source: "grok-token-file" };
  } catch {
    return null;
  }
}

async function fetchGrokAdminTokenPayload(config: ReturnType<typeof getCheckConfig>): Promise<string | null> {
  if (!config.grokAdminApiKey) return null;

  try {
    const response = await fetch(`${config.grokAdminBaseUrl}/v1/admin/tokens`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.grokAdminApiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function resolveGrokTokenError(item: ReturnType<typeof parseGrokTokenStates>[number]): string | null {
  if (item.lastFailReason) return truncate(item.lastFailReason);
  if (item.status === "rate_limited") return "quota_depleted";
  if (item.status === "invalid") return item.rawStatus || "invalid";
  return null;
}

async function syncAccountStates(provider: Provider, accounts: AccountStateInput[]) {
  const accountKeys = accounts.map((item) => item.accountKey);
  await prisma.aiAccountState.deleteMany({
    where: accountKeys.length > 0 ? { provider, accountKey: { notIn: accountKeys } } : { provider },
  });

  for (const account of accounts) {
    await prisma.aiAccountState.upsert({
      where: {
        provider_accountKey: {
          provider: account.provider,
          accountKey: account.accountKey,
        },
      },
      update: {
        displayLabel: account.displayLabel,
        status: account.status,
        lastUsedAt: account.lastUsedAt,
        lastSuccessAt: account.lastSuccessAt,
        lastObservedAt: account.lastObservedAt,
        lastError: account.lastError,
        requestCount24h: account.requestCount24h,
        successRate24h: account.successRate24h,
        metadataJson: account.metadataJson,
      },
      create: account,
    });
  }
}

async function buildProviderSnapshots(
  now: Date,
  accounts: AccountStateInput[]
): Promise<ProviderSnapshotInput[]> {
  const [qwenHealthRates, longcatHealthRates, qwenUsage, longcatUsage] = await Promise.all([
    getProviderHealthRates("qwen", now),
    getProviderHealthRates("longcat", now),
    getProviderUsageSummary("qwen", now),
    getProviderUsageSummary("longcat", now),
  ]);

  return [
    buildProviderSnapshot(
      "qwen",
      accounts.filter((account) => account.provider === "qwen"),
      {
        requests1h: qwenUsage.requests1h,
        requests24h: qwenUsage.requests24h,
        successRate1h: qwenHealthRates.successRate1h,
        successRate24h: qwenHealthRates.successRate24h,
      }
    ),
    buildProviderSnapshot(
      "longcat",
      accounts.filter((account) => account.provider === "longcat"),
      {
        requests1h: longcatUsage.requests1h,
        requests24h: longcatUsage.requests24h,
        successRate1h: longcatHealthRates.successRate1h,
        successRate24h: longcatHealthRates.successRate24h,
      }
    ),
  ];
}

async function getProviderUsageSummary(provider: Provider, now: Date) {
  const [requests1h, requests24h] = await Promise.all([
    prisma.keyUsage.count({
      where: {
        createdAt: { gte: subtractMs(now, HOUR_MS) },
        providerKey: { provider },
      },
    }),
    prisma.keyUsage.count({
      where: {
        createdAt: { gte: subtractMs(now, DAY_MS) },
        providerKey: { provider },
      },
    }),
  ]);

  return { requests1h, requests24h };
}

function buildProviderSnapshot(
  provider: Provider,
  accounts: AccountStateInput[],
  usage: { requests1h: number; requests24h: number; successRate1h: number; successRate24h: number }
): ProviderSnapshotInput {
  return {
    provider,
    totalAccounts: accounts.length,
    healthyAccounts: accounts.filter((item) => item.status === "healthy").length,
    rateLimitedAccounts: accounts.filter((item) => item.status === "rate_limited").length,
    invalidAccounts: accounts.filter((item) => item.status === "invalid").length,
    staleAccounts: accounts.filter((item) => item.status === "stale").length,
    unknownAccounts: accounts.filter((item) => item.status === "unknown").length,
    requests1h: usage.requests1h,
    requests24h: usage.requests24h,
    successRate1h: usage.successRate1h,
    successRate24h: usage.successRate24h,
  };
}

async function getProviderHealthRates(provider: Provider, now: Date) {
  const [health1h, health24h] = await Promise.all([
    prisma.aiServiceHealth.findMany({
      where: { provider, checkedAt: { gte: subtractMs(now, HOUR_MS) } },
      select: { status: true },
    }),
    prisma.aiServiceHealth.findMany({
      where: { provider, checkedAt: { gte: subtractMs(now, DAY_MS) } },
      select: { status: true },
    }),
  ]);

  return {
    successRate1h: calculateHealthRate(health1h.map((item) => item.status)),
    successRate24h: calculateHealthRate(health24h.map((item) => item.status)),
  };
}

async function createIncidents(
  now: Date,
  services: ServiceHealthRecordInput[],
  accounts: AccountStateInput[]
): Promise<number> {
  let created = 0;

  for (const service of services) {
    if (service.status === "healthy") continue;
    created += await createIncidentIfNeeded({
      provider: service.provider,
      scope: "service",
      severity: service.status === "unhealthy" ? "high" : "medium",
      title: `${service.service} ${service.status}`,
      message: service.lastError || `${service.service} status is ${service.status}`,
      service: service.service,
      accountKey: null,
      occurredAt: now,
    });
  }

  for (const account of accounts) {
    if (account.status !== "invalid" && account.status !== "rate_limited") continue;
    if (!account.lastError) continue;
    created += await createIncidentIfNeeded({
      provider: account.provider,
      scope: "account",
      severity: account.status === "invalid" ? "high" : "medium",
      title: `${account.provider} account ${account.status}`,
      message: account.lastError,
      service: null,
      accountKey: account.accountKey,
      occurredAt: now,
    });
  }

  return created;
}

async function createIncidentIfNeeded(input: {
  provider: Provider;
  scope: string;
  severity: string;
  title: string;
  message: string;
  service: string | null;
  accountKey: string | null;
  occurredAt: Date;
}): Promise<number> {
  const existing = await prisma.aiIncident.findFirst({
    where: {
      provider: input.provider,
      scope: input.scope,
      title: input.title,
      message: input.message,
      service: input.service,
      accountKey: input.accountKey,
      occurredAt: { gte: subtractMs(input.occurredAt, HOUR_MS) },
    },
  });
  if (existing) return 0;

  await prisma.aiIncident.create({
    data: {
      provider: input.provider,
      scope: input.scope,
      severity: input.severity,
      title: input.title,
      message: input.message,
      service: input.service,
      accountKey: input.accountKey,
      occurredAt: input.occurredAt,
    },
  });
  return 1;
}

async function cleanupOldRecords(now: Date) {
  const cutoff = subtractMs(now, THIRTY_DAYS_MS);
  await Promise.all([
    prisma.aiServiceHealth.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
    prisma.aiProviderSnapshot.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
    prisma.aiIncident.deleteMany({ where: { occurredAt: { lt: cutoff } } }),
  ]);
}

async function listFiles(directory: string, predicate: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return truncate(await response.text(), 500);
  } catch {
    return "";
  }
}

function extractVersion(body: string): string | null {
  const match = body.match(/v\d+\.\d+\.\d+(?:-[\w.]+)?/i);
  return match?.[0] ?? null;
}

function parseMaybeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maxDate(values: Array<Date | null | undefined>): Date | null {
  const valid = values.filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((value) => value.getTime())));
}

function subtractMs(date: Date, durationMs: number): Date {
  return new Date(date.getTime() - durationMs);
}

function calculateHealthRate(statuses: string[]): number {
  if (statuses.length === 0) return 100;
  const healthyCount = statuses.filter((status) => status === "healthy").length;
  return Math.round((healthyCount / statuses.length) * 100);
}

function buildGrokMetadata(account: ParsedGrokAccount, filePath: string, observedAt: Date) {
  return {
    source: "grok-result",
    sourceFile: path.basename(filePath),
    emailDomain: account.email.split("@")[1] ?? null,
    hasSso: Boolean(account.sso),
    hasSsoRw: Boolean(account.ssoRw),
    observedAt: observedAt.toISOString(),
  };
}

function dedupeAccountStates(accounts: AccountStateInput[]): AccountStateInput[] {
  const map = new Map<string, AccountStateInput>();
  for (const account of accounts) {
    const existing = map.get(account.accountKey);
    if (!existing) {
      map.set(account.accountKey, account);
      continue;
    }
    const existingObserved = existing.lastObservedAt?.getTime() ?? 0;
    const currentObserved = account.lastObservedAt?.getTime() ?? 0;
    if (currentObserved >= existingObserved) {
      map.set(account.accountKey, account);
    }
  }
  return [...map.values()];
}

function truncate(value: string, maxLength = 200): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const THIRTY_DAYS_MS = 30 * DAY_MS;
