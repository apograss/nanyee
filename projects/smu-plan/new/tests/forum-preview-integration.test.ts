import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("forum preview helper requests included author data and supports an internal fetch base", () => {
  const helper = readProjectFile("src", "lib", "forum", "latest.ts");

  assert.match(helper, /include=user,lastPostedUser/);
  assert.match(helper, /FORUM_INTERNAL_BASE_URL/);
  assert.match(helper, /included/);
});

test("forum navigation goes through /bbs in the same tab", () => {
  const nav = readProjectFile("src", "lib", "site", "nav.ts");
  const header = readProjectFile("src", "components", "organisms", "Header.tsx");

  assert.match(nav, /href:\s*"\/bbs"/);
  assert.doesNotMatch(nav, /href:\s*"https:\/\/chat\.nanyee\.de"[\s\S]*external:\s*true/);
  assert.match(header, /link\.external/);
  assert.doesNotMatch(header, /target="_blank"/);
});
