import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("wiki history exposes a dedicated diff view backed by jsdiff", () => {
  const packageJson = readProjectFile("package.json");
  const historyPage = readProjectFile(
    "src",
    "app",
    "(main)",
    "kb",
    "[slug]",
    "history",
    "page.tsx",
  );

  assert.match(packageJson, /"diff":/);
  assert.match(historyPage, /WikiDiffView/);
  assert.match(historyPage, /对比/);
});
