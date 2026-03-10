import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAiRouteError } from "@/lib/ai/errors";

test("normalizeAiRouteError preserves upstream status and message", () => {
  const error = Object.assign(new Error("Grok upstream returned 403: blocked"), {
    status: 502,
  });

  assert.deepEqual(normalizeAiRouteError(error), {
    status: 502,
    code: 502,
    message: "Grok upstream returned 403: blocked",
  });
});

test("normalizeAiRouteError falls back to generic 500 for unknown values", () => {
  assert.deepEqual(normalizeAiRouteError("boom"), {
    status: 500,
    code: 500,
    message: "Internal Server Error",
  });
});
