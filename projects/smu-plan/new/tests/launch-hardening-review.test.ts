import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("captcha api no longer leaks raw upstream cookies and enroll flow uses session ids", () => {
  const captchaRoute = readProjectFile("src", "app", "api", "tools", "captcha", "route.ts");
  const enrollClient = readProjectFile("src", "lib", "enroll-client.ts");

  assert.doesNotMatch(captchaRoute, /rawCookies/);
  assert.match(enrollClient, /sessionId/);
  assert.doesNotMatch(enrollClient, /rawCookies/);
});

test("evaluation engine checks save responses before claiming success", () => {
  const evalEngine = readProjectFile("src", "lib", "eval-engine.ts");

  assert.match(evalEngine, /saveResp\.ok/);
  assert.match(evalEngine, /throw new Error/);
  assert.match(evalEngine, /saveText/);
});

test("new release UI copy stays readable in evaluation and wiki surfaces", () => {
  const evaluationPage = readProjectFile("src", "app", "(main)", "tools", "evaluation", "page.tsx");
  const articlePage = readProjectFile("src", "app", "(main)", "kb", "[slug]", "page.tsx");
  const toc = readProjectFile("src", "components", "organisms", "TableOfContents", "TableOfContents.tsx");

  assert.match(evaluationPage, /自动评课/);
  assert.match(evaluationPage, /返回工具列表/);
  assert.match(articlePage, /面包屑导航/);
  assert.match(articlePage, /次浏览/);
  assert.match(toc, /文章目录/);
  assert.doesNotMatch(evaluationPage, /鎴|鈹|馃/);
  assert.doesNotMatch(articlePage, /闈㈠寘灞|娆℃祻瑙/);
  assert.doesNotMatch(toc, /鏂囩珷鐩綍/);
});

test("eval task migration is tracked in git", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "--error-unmatch", "prisma/migrations/20260315120000_add_eval_task/migration.sql"],
    { cwd: projectRoot, encoding: "utf8" },
  );

  assert.match(tracked, /20260315120000_add_eval_task/);
});

test("jwt secrets are loaded lazily so imports do not require env upfront", () => {
  const jwt = readProjectFile("src", "lib", "auth", "jwt.ts");

  assert.match(jwt, /function getAccessSecret/);
  assert.match(jwt, /function getRefreshSecret/);
  assert.doesNotMatch(jwt, /const ACCESS_SECRET =/);
  assert.doesNotMatch(jwt, /const REFRESH_SECRET =/);
});
