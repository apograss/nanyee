import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("check station switches provider-facing logic from chatgpt/grok to qwen/longcat", () => {
  const collector = readProjectFile("src", "lib", "check", "collector.ts");
  const queries = readProjectFile("src", "lib", "check", "queries.ts");
  const publicClient = readProjectFile("src", "app", "check-internal", "public-client.tsx");
  const adminClient = readProjectFile("src", "app", "check-internal", "admin", "admin-client.tsx");

  assert.match(collector, /type Provider = "qwen" \| "longcat"/);
  assert.match(queries, /const PROVIDERS = \["qwen", "longcat"\]/);

  assert.match(publicClient, /Qwen/);
  assert.match(publicClient, /LongCat/);
  assert.doesNotMatch(publicClient, /ChatGPT 请求量|Grok 请求量/);

  assert.match(adminClient, /value="qwen"/);
  assert.match(adminClient, /value="longcat"/);
  assert.doesNotMatch(adminClient, /value="chatgpt"|value="grok"/);
});
