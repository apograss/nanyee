import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderArticleBody } from "@/lib/wiki/render";
import { slugifyWikiCategoryName } from "@/lib/wiki/categories";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("renderArticleBody gives markdown headings stable anchors and upgrades rich blocks", async () => {
  const html = await renderArticleBody({
    format: "markdown",
    content: [
      "# 校园生活",
      "",
      "访问 [论坛](https://chat.nanyee.de)。",
      "",
      "| 栏目 | 说明 |",
      "| --- | --- |",
      "| 论坛 | 校园讨论 |",
      "",
      "```ts",
      "console.log('hello')",
      "```",
    ].join("\n"),
  });

  assert.match(
    html,
    new RegExp(`<h1 id="${slugifyWikiCategoryName("校园生活")}">校园生活</h1>`),
  );
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /class="article-table-wrap"/);
  assert.match(html, /class="article-code-block"/);
});

test("wiki category deletion clears both category binding and legacy text fallback", () => {
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "wiki",
    "categories",
    "[id]",
    "route.ts",
  );

  assert.match(route, /data:\s*\{[\s\S]*categoryId:\s*null,\s*category:\s*null[\s\S]*\}/);
});
