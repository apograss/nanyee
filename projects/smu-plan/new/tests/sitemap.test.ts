import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("sitemap exports public static routes and knowledge base articles", () => {
  const sitemap = readProjectFile("src", "app", "sitemap.ts");

  assert.match(sitemap, /MetadataRoute\.Sitemap/);
  assert.match(sitemap, /\/kb/);
  assert.match(sitemap, /\/tools/);
  assert.match(sitemap, /\/guestbook/);
  assert.match(sitemap, /prisma\.article\.findMany/);
  assert.match(sitemap, /status:\s*"published"/);
});
