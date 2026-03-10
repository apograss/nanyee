import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicOverviewMetrics } from "@/app/check-internal/public-view";

test("buildPublicOverviewMetrics computes aggregate dashboard stats", () => {
  const result = buildPublicOverviewMetrics([
    {
      provider: "chatgpt",
      totalAccounts: 2581,
      healthyAccounts: 1725,
      invalidAccounts: 0,
      rateLimitedAccounts: 0,
      successRate24h: 100,
      requests24h: 824,
    },
    {
      provider: "grok",
      totalAccounts: 2744,
      healthyAccounts: 2744,
      invalidAccounts: 0,
      rateLimitedAccounts: 0,
      successRate24h: 100,
      requests24h: 0,
    },
  ]);

  assert.equal(result.totalAccounts, 5325);
  assert.equal(result.healthyAccounts, 4469);
  assert.equal(result.healthPercent, 84);
  assert.equal(result.totalRequests24h, 824);
  assert.equal(result.averageSuccessRate24h, 100);
});
