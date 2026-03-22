import { prisma } from "@/lib/prisma";

import { getCheckConfig } from "./config";
import { resolveLatestCheckAt } from "./view-models";

const PROVIDERS = ["qwen", "longcat"] as const;

export async function getPublicCheckSummary() {
  const [services, snapshots, incidents] = await Promise.all([
    getLatestServiceStatuses(),
    getLatestProviderSnapshots(),
    prisma.aiIncident.findMany({
      where: { provider: { in: [...PROVIDERS] } },
      orderBy: { occurredAt: "desc" },
      take: 12,
      select: {
        id: true,
        provider: true,
        scope: true,
        severity: true,
        title: true,
        message: true,
        service: true,
        occurredAt: true,
      },
    }),
  ]);

  return {
    ok: true,
    data: {
      checkedAt: resolveLatestCheckAt([
        ...services.map((item) => item.checkedAt),
        ...snapshots.map((item) => item.capturedAt),
      ]),
      services,
      providers: snapshots,
      incidents,
    },
  };
}

export async function getPublicCheckHistory(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.aiProviderSnapshot.findMany({
    where: { capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: {
      provider: true,
      capturedAt: true,
      healthyAccounts: true,
      requests24h: true,
      successRate24h: true,
      invalidAccounts: true,
      rateLimitedAccounts: true,
    },
  });

  const grouped = new Map<string, (typeof snapshots)[number]>();
  for (const item of snapshots) {
    const day = item.capturedAt.toISOString().slice(0, 10);
    const key = `${item.provider}:${day}`;
    grouped.set(key, item);
  }

  const series = [...grouped.values()].map((item) => ({
    provider: item.provider,
    date: item.capturedAt.toISOString().slice(0, 10),
    healthyAccounts: item.healthyAccounts,
    requests24h: item.requests24h,
    successRate24h: item.successRate24h,
    invalidAccounts: item.invalidAccounts,
    rateLimitedAccounts: item.rateLimitedAccounts,
  }));

  return { ok: true, data: { days, series } };
}

export async function getAdminAiMonitorOverview() {
  const [summary, latestAccounts, links] = await Promise.all([
    getPublicCheckSummary(),
    prisma.aiAccountState.findMany({
      where: { provider: { in: [...PROVIDERS] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
      select: {
        id: true,
        provider: true,
        displayLabel: true,
        status: true,
        lastObservedAt: true,
        lastError: true,
        requestCount24h: true,
        successRate24h: true,
      },
    }),
    Promise.resolve(buildAdminLinks()),
  ]);

  return {
    ok: true,
    data: {
      ...summary.data,
      latestAccounts,
      links,
    },
  };
}

export async function getAdminAiAccounts(params: {
  provider?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const provider = params.provider && PROVIDERS.includes(params.provider as (typeof PROVIDERS)[number]) ? params.provider : undefined;
  const status = params.status || undefined;
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 50));
  const skip = (page - 1) * limit;

  const where = {
    ...(provider ? { provider } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.aiAccountState.findMany({
      where,
      orderBy: [{ provider: "asc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        provider: true,
        displayLabel: true,
        status: true,
        lastUsedAt: true,
        lastSuccessAt: true,
        lastObservedAt: true,
        lastError: true,
        requestCount24h: true,
        successRate24h: true,
        updatedAt: true,
      },
    }),
    prisma.aiAccountState.count({ where }),
  ]);

  return {
    ok: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    },
  };
}

export async function getAdminAiIncidents() {
  const incidents = await prisma.aiIncident.findMany({
    where: { provider: { in: [...PROVIDERS] } },
    orderBy: { occurredAt: "desc" },
    take: 100,
    select: {
      id: true,
      provider: true,
      scope: true,
      severity: true,
      title: true,
      message: true,
      service: true,
      accountKey: true,
      occurredAt: true,
    },
  });

  return { ok: true, data: { incidents } };
}

async function getLatestServiceStatuses() {
  const rows = await prisma.aiServiceHealth.findMany({
    where: { provider: { in: [...PROVIDERS] } },
    orderBy: { checkedAt: "desc" },
    select: {
      provider: true,
      service: true,
      status: true,
      latencyMs: true,
      version: true,
      lastError: true,
      checkedAt: true,
    },
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.service)) latest.set(row.service, row);
  }
  return [...latest.values()];
}

async function getLatestProviderSnapshots() {
  const rows = await prisma.aiProviderSnapshot.findMany({
    where: { provider: { in: [...PROVIDERS] } },
    orderBy: { capturedAt: "desc" },
    select: {
      provider: true,
      capturedAt: true,
      totalAccounts: true,
      healthyAccounts: true,
      rateLimitedAccounts: true,
      invalidAccounts: true,
      staleAccounts: true,
      unknownAccounts: true,
      requests1h: true,
      requests24h: true,
      successRate1h: true,
      successRate24h: true,
    },
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.provider)) latest.set(row.provider, row);
  }
  return [...latest.values()];
}

function buildAdminLinks() {
  const config = getCheckConfig();
  return {
    grokAdminUrl: config.grokAdminUrl || null,
    newApiAdminUrl: config.newApiAdminUrl || null,
    mainAdminUrl: "/admin",
  };
}
