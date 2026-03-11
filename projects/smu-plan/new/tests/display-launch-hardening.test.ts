import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("forum bridge pages avoid JS-only hard redirects and preserve migration context", () => {
  const newTopicPage = readProjectFile("src/app/(main)/bbs/new/page.tsx");
  const topicPage = readProjectFile("src/app/(main)/bbs/[id]/page.tsx");

  assert.doesNotMatch(newTopicPage, /window\.location\.href\s*=/);
  assert.doesNotMatch(topicPage, /window\.location\.href\s*=/);
  assert.match(topicPage, /legacyTopicId|params/);
});

test("SMU tools do not persist credentials in localStorage", () => {
  const schedulePage = readProjectFile("src/app/(main)/tools/schedule/page.tsx");
  const gradesPage = readProjectFile("src/app/(main)/tools/grades/page.tsx");
  const enrollPage = readProjectFile("src/app/(main)/tools/enroll/page.tsx");

  assert.doesNotMatch(schedulePage, /localStorage/);
  assert.doesNotMatch(gradesPage, /localStorage/);
  assert.doesNotMatch(enrollPage, /localStorage/);
});

test("home page avoids forced autofocus and exposes accessible labels for primary controls", () => {
  const homePage = readProjectFile("src/app/(main)/page.tsx");

  assert.doesNotMatch(homePage, /\bautoFocus\b/);
  assert.match(homePage, /aria-label="[^"]+"/);
  assert.match(homePage, /searchInput[\s\S]*aria-label=/);
  assert.match(homePage, /chatInput[\s\S]*aria-label=/);
  assert.match(homePage, /newChatBtn[\s\S]*aria-label=/);
});

test("critical display flows avoid native browser dialogs", () => {
  const linksPage = readProjectFile("src/app/(main)/links/page.tsx");
  const historyPage = readProjectFile("src/app/(main)/kb/[slug]/history/page.tsx");
  const adminArticlesPage = readProjectFile("src/app/admin/articles/page.tsx");

  for (const source of [linksPage, historyPage, adminArticlesPage]) {
    assert.doesNotMatch(source, /\balert\s*\(/);
    assert.doesNotMatch(source, /\bconfirm\s*\(/);
    assert.doesNotMatch(source, /\bprompt\s*\(/);
  }
});
