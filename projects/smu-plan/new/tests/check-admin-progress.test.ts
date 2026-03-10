import test from "node:test";
import assert from "node:assert/strict";

import { getProgressPercent, getProgressVariant } from "@/app/check-internal/admin/progress";

test("getProgressPercent returns 0 when total is missing", () => {
  assert.equal(getProgressPercent(10, 0), 0);
  assert.equal(getProgressPercent(10, -1), 0);
});

test("getProgressPercent clamps progress between 0 and 100", () => {
  assert.equal(getProgressPercent(0, 10), 0);
  assert.equal(getProgressPercent(5, 10), 50);
  assert.equal(getProgressPercent(15, 10), 100);
});

test("getProgressVariant prefers refresh over loading", () => {
  assert.equal(getProgressVariant({ loading: true, refreshStatus: "idle" }), "loading");
  assert.equal(getProgressVariant({ loading: false, refreshStatus: "running" }), "refresh");
  assert.equal(getProgressVariant({ loading: true, refreshStatus: "running" }), "refresh");
  assert.equal(getProgressVariant({ loading: false, refreshStatus: "done" }), "idle");
});
