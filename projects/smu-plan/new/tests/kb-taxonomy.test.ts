import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  slugifyWikiCategoryName,
  canWriteWikiCategory,
} from "@/lib/wiki/categories";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("slugifyWikiCategoryName produces stable category slugs", () => {
  assert.equal(slugifyWikiCategoryName("校园生活"), "u6821-u56ed-u751f-u6d3b");
  assert.equal(
    slugifyWikiCategoryName("本科·学习指南"),
    "u672c-u79d1-ub7-u5b66-u4e60-u6307-u5357",
  );
});

test("canWriteWikiCategory keeps parent categories admin-only and children collaborative", () => {
  assert.equal(
    canWriteWikiCategory({ role: "admin", parentId: null }, "create"),
    true,
  );
  assert.equal(
    canWriteWikiCategory({ role: "contributor", parentId: null }, "create"),
    false,
  );
  assert.equal(
    canWriteWikiCategory({ role: "contributor", parentId: "parent_1" }, "update"),
    true,
  );
});

test("prisma schema adds hierarchical wiki categories and article category binding", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(schema, /model WikiCategory/);
  assert.match(schema, /categoryId\s+String\?/);
  assert.match(schema, /categoryRef\s+WikiCategory\?/);
});

test("wiki routes and editor use categoryId rather than free-text category only", () => {
  const createRoute = readProjectFile("src", "app", "api", "wiki", "route.ts");
  const updateRoute = readProjectFile(
    "src",
    "app",
    "api",
    "wiki",
    "[slug]",
    "route.ts",
  );
  const editorPage = readProjectFile(
    "src",
    "app",
    "(main)",
    "editor",
    "page.tsx",
  );

  assert.match(createRoute, /categoryId/);
  assert.match(updateRoute, /categoryId/);
  assert.match(editorPage, /parentCategory|childCategory|categoryId/);
});

test("article detail keeps the comment anchor body and uses dedicated article styles", () => {
  const articlePage = readProjectFile(
    "src",
    "app",
    "(main)",
    "kb",
    "[slug]",
    "page.tsx",
  );

  assert.match(articlePage, /data-article-body/);
  assert.match(articlePage, /article\.module\.css/);
});

test("admin nav exposes a dedicated wiki category management entry", () => {
  const adminConfig = readProjectFile("src", "app", "admin", "config.ts");

  assert.match(adminConfig, /\/admin\/wiki-categories/);
});
