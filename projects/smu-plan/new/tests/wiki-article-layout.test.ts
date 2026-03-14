import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("wiki article page uses a main column with a right rail for toc and comments", () => {
  const articlePage = readProjectFile(
    "src",
    "app",
    "(main)",
    "kb",
    "[slug]",
    "page.tsx",
  );
  const articleCss = readProjectFile(
    "src",
    "app",
    "(main)",
    "kb",
    "[slug]",
    "article.module.css",
  );

  assert.match(articlePage, /mainColumn/);
  assert.match(articlePage, /sideRail/);
  assert.match(articlePage, /CommentSystem/);
  assert.match(articlePage, /InteractiveHtmlFrame/);
  assert.match(articleCss, /\.mainColumn/);
  assert.match(articleCss, /\.sideRail/);
  assert.match(articleCss, /\.interactiveFrame/);
});

test("wiki api routes allow interactive html format", () => {
  const createRoute = readProjectFile("src", "app", "api", "wiki", "route.ts");
  const updateRoute = readProjectFile(
    "src",
    "app",
    "api",
    "wiki",
    "[slug]",
    "route.ts",
  );

  assert.match(createRoute, /interactive-html/);
  assert.match(updateRoute, /interactive-html/);
  assert.match(createRoute, /canUseInteractiveHtml\(auth\.role\)/);
  assert.match(updateRoute, /canUseInteractiveHtml\(auth\.role\)/);
});
