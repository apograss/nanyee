import test from "node:test";
import assert from "node:assert/strict";

import { resolveLatestCheckAt } from "@/lib/check/view-models";

test("resolveLatestCheckAt prefers the newest timestamp", () => {
  const result = resolveLatestCheckAt([
    "2026-03-07T00:00:00.000Z",
    "2026-03-07T00:10:00.000Z",
    "2026-03-06T23:59:00.000Z",
  ]);

  assert.equal(result, "2026-03-07T00:10:00.000Z");
});

test("resolveLatestCheckAt ignores invalid values and falls back when needed", () => {
  const fallback = new Date("2026-03-07T01:00:00.000Z");
  const result = resolveLatestCheckAt(["bad-date", null, undefined], fallback);

  assert.equal(result, "2026-03-07T01:00:00.000Z");
});
