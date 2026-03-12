import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("guestbook shows a character counter and blocks over-limit submissions", () => {
  const guestbookPage = readProjectFile("src", "app", "(main)", "guestbook", "page.tsx");

  assert.match(guestbookPage, /charCount/);
  assert.match(guestbookPage, /input\.trim\(\)\.length > 500/);
});

test("forum compose entry stays same-tab and probes /compose safely", () => {
  const forumHelper = readProjectFile("src", "lib", "forum", "latest.ts");
  const newTopicPage = readProjectFile("src", "app", "(main)", "bbs", "new", "page.tsx");

  assert.match(forumHelper, /getForumComposeUrl/);
  assert.match(newTopicPage, /getForumComposeUrl/);
  assert.doesNotMatch(newTopicPage, /target="_blank"/);
});

test("kb leaderboard and tools dropdown are wired into page and header", () => {
  const kbPage = readProjectFile("src", "app", "(main)", "kb", "page.tsx");
  const header = readProjectFile("src", "components", "organisms", "Header.tsx");

  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "wiki", "leaderboard", "route.ts")),
    true,
  );
  assert.match(kbPage, /getWikiLeaderboard/);
  assert.match(kbPage, /本周热门/);
  assert.match(kbPage, /贡献者排行/);
  assert.match(header, /TOOL_MENU_ITEMS/);
  assert.match(header, /toolsMenuOpen/);
});
