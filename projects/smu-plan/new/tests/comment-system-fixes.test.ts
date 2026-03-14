import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("comment icons stay inside the article frame and comment failures are surfaced", () => {
  const commentCss = readProjectFile(
    "src",
    "components",
    "organisms",
    "CommentSystem",
    "CommentSystem.module.css",
  );
  const commentTsx = readProjectFile(
    "src",
    "components",
    "organisms",
    "CommentSystem",
    "CommentSystem.tsx",
  );

  assert.doesNotMatch(commentCss, /right:\s*-\d+px/);
  assert.match(commentTsx, /setRequestError|requestError/);
  assert.match(commentTsx, /data\.error\?\.message/);
  assert.match(commentTsx, /closest\("table"\)/);
  assert.doesNotMatch(commentTsx, /p, h1, h2, h3, h4, h5, h6, li, blockquote/);
  assert.doesNotMatch(commentCss, /position:\s*fixed/);
});
