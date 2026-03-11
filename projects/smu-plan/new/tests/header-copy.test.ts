import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("header and forum bridge pages use normal chinese copy", () => {
  const header = readProjectFile("src", "components", "organisms", "Header.tsx");
  const bbsPage = readProjectFile("src", "app", "(main)", "bbs", "page.tsx");
  const bbsNew = readProjectFile("src", "app", "(main)", "bbs", "new", "page.tsx");

  assert.match(header, /登录/);
  assert.match(header, /管理后台/);
  assert.match(bbsPage, /论坛/);
  assert.match(bbsNew, /发布主题|论坛/);
});
