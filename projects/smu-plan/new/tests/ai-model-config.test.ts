import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAT_MODEL_OPTIONS,
  CHAT_MODEL_LABELS,
  DEFAULT_CHAT_MODEL,
} from "@/lib/ai/models";

test("chat model config uses longcat for fast mode and grok for deep mode", () => {
  assert.deepEqual(CHAT_MODEL_OPTIONS, [
    "longcat-flash-chat",
    "grok-4.20-beta",
  ]);

  assert.equal(DEFAULT_CHAT_MODEL, "longcat-flash-chat");
  assert.deepEqual(CHAT_MODEL_LABELS["longcat-flash-chat"], {
    label: "快速",
    desc: "LongCat Flash Chat",
  });
  assert.deepEqual(CHAT_MODEL_LABELS["grok-4.20-beta"], {
    label: "深度思考",
    desc: "Grok 4.20 Beta",
  });
});
