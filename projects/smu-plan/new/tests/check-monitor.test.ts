import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAccountStatus,
  classifyGrokTokenState,
  parseGrokAccounts,
  parseGrokTokenStates,
  rewriteCheckPath,
  type ObservedAccountSignal,
} from "@/lib/check/monitor-core";
import { extractGrokAdminTokens, parseGrokRefreshSnapshot } from "@/lib/check/grok-admin";

test("rewriteCheckPath rewrites root path for check host", () => {
  assert.equal(rewriteCheckPath("/", "check.nanyee.de"), "/check-internal");
  assert.equal(rewriteCheckPath("/admin", "check.nanyee.de"), "/check-internal/admin");
  assert.equal(
    rewriteCheckPath("/admin/login?redirect=/admin", "check.nanyee.de"),
    "/check-internal/admin/login?redirect=/admin"
  );
});

test("rewriteCheckPath leaves non-check hosts untouched", () => {
  assert.equal(rewriteCheckPath("/", "nanyee.de"), null);
  assert.equal(rewriteCheckPath("/admin", "api.nanyee.de"), null);
});

test("parseGrokAccounts extracts account blocks without returning secrets in labels", () => {
  const sample = [
    "Email: grok6844b893a2@fuckopenai.us.ci",
    "Password: secret-pass",
    "SSO: sso-token",
    "SSO-RW: sso-rw-token",
    "----------------------------------------",
    "Email: grokb319e8a1b2@orangeade.us.ci",
    "Password: second-pass",
    "SSO: second-sso",
    "SSO-RW: second-sso-rw",
  ].join("\n");

  const accounts = parseGrokAccounts(sample);

  assert.equal(accounts.length, 2);
  assert.equal(accounts[0]?.email, "grok6844b893a2@fuckopenai.us.ci");
  assert.equal(accounts[1]?.email, "grokb319e8a1b2@orangeade.us.ci");
  assert.match(accounts[0]?.displayLabelMasked ?? "", /^grok.*@fuckopenai\.us\.ci$/);
  assert.notEqual(accounts[0]?.displayLabelMasked, accounts[0]?.password);
});

test("classifyAccountStatus prefers explicit invalid errors", () => {
  const signal: ObservedAccountSignal = {
    lastSuccessAt: null,
    lastObservedAt: new Date("2026-03-06T12:00:00.000Z"),
    lastError: "token_invalidated",
    requestCount24h: 5,
    successCount24h: 0,
  };

  assert.equal(classifyAccountStatus(signal, new Date("2026-03-06T12:30:00.000Z")), "invalid");
});

test("classifyAccountStatus marks stale accounts when there is no recent success or error", () => {
  const signal: ObservedAccountSignal = {
    lastSuccessAt: null,
    lastObservedAt: new Date("2026-03-04T12:00:00.000Z"),
    lastError: null,
    requestCount24h: 0,
    successCount24h: 0,
  };

  assert.equal(classifyAccountStatus(signal, new Date("2026-03-06T12:30:00.000Z")), "stale");
});

test("classifyGrokTokenState does not treat unknown token state as healthy", () => {
  assert.equal(classifyGrokTokenState({ quota: 5, rawStatus: null }), "unknown");
  assert.equal(classifyGrokTokenState({ quota: 5, rawStatus: "pending" }), "unknown");
});

test("classifyGrokTokenState marks depleted quota as rate_limited", () => {
  assert.equal(classifyGrokTokenState({ quota: 0, rawStatus: "active" }), "rate_limited");
});

test("parseGrokTokenStates extracts token state summary without secrets", () => {
  const raw = JSON.stringify({
    ssoBasic: [
      { email: "grok1@example.com", quota: 2, status: "active", last_sync_at: 1772785196204 },
      { email: "grok2@example.com", quota: 0, status: "active" },
    ],
    ssoSuper: [{ email: "grok3@example.com", quota: 1, status: "disabled" }],
  });

  const states = parseGrokTokenStates(raw);

  assert.equal(states.length, 3);
  assert.deepEqual(
    states.map((item) => item.status),
    ["healthy", "rate_limited", "invalid"]
  );
  assert.equal(states[0]?.displayLabelMasked.includes("example.com"), true);
});

test("parseGrokTokenStates supports grok2api admin token payload without email", () => {
  const raw = JSON.stringify({
    ssoBasic: [
      {
        token: "token-alpha",
        note: "gr***********4@orangeade.us.ci",
        quota: 8,
        status: "active",
        last_fail_reason: null,
        last_sync_at: 1772785196204,
      },
      {
        token: "token-beta",
        note: "gr***********5@grass.cc.cd",
        quota: 0,
        status: "active",
        last_fail_reason: null,
      },
      {
        token: "token-gamma",
        note: "gr***********6@orangeade.us.ci",
        quota: 2,
        status: "active",
        last_fail_reason: "token_invalidated",
      },
    ],
  });

  const states = parseGrokTokenStates(raw);

  assert.equal(states.length, 3);
  assert.deepEqual(
    states.map((item) => item.status),
    ["healthy", "rate_limited", "invalid"]
  );
  assert.equal(states[0]?.displayLabelMasked, "gr***********4@orangeade.us.ci");
  assert.notEqual(states[0]?.accountKey, states[1]?.accountKey);
});

test("parseGrokTokenStates keeps unsynced active admin tokens as unknown", () => {
  const raw = JSON.stringify({
    ssoBasic: [
      {
        token: "token-unsynced",
        note: "gr***********x@orangeade.us.ci",
        quota: 8,
        status: "active",
        last_fail_reason: null,
        last_sync_at: null,
        last_used_at: null,
      },
    ],
  });

  const states = parseGrokTokenStates(raw);

  assert.equal(states.length, 1);
  assert.equal(states[0]?.status, "unknown");
});

test("extractGrokAdminTokens flattens token pools and removes duplicates", () => {
  const raw = JSON.stringify({
    ssoBasic: [{ token: "alpha" }, { token: "beta" }],
    ssoSuper: [{ token: "beta" }, { token: "gamma" }],
  });

  assert.deepEqual(extractGrokAdminTokens(raw), ["alpha", "beta", "gamma"]);
});

test("parseGrokRefreshSnapshot reads the first SSE data payload", () => {
  const raw = [
    ": ping",
    "",
    'data: {"type":"snapshot","task_id":"task-1","status":"running","total":10,"processed":4,"ok":3,"fail":1}',
    "",
    'data: {"type":"progress","task_id":"task-1","status":"running","total":10,"processed":5,"ok":4,"fail":1}',
    "",
  ].join("\n");

  assert.deepEqual(parseGrokRefreshSnapshot(raw), {
    taskId: "task-1",
    status: "running",
    total: 10,
    processed: 4,
    ok: 3,
    fail: 1,
    warning: null,
    error: null,
  });
});
