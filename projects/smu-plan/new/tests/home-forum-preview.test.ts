import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("home preview aggregates latest forum discussions and homepage consumes them", () => {
  const queries = readProjectFile("src", "lib", "wiki", "queries.ts");
  const homepage = readProjectFile("src", "app", "(main)", "page.tsx");

  assert.match(queries, /latestForumPosts/);
  assert.match(queries, /getLatestForumPosts/);
  assert.match(homepage, /preview\?\.latestForumPosts/);
  assert.doesNotMatch(homepage, /FORUM_PLACEHOLDER_ITEMS\.map/);
});
