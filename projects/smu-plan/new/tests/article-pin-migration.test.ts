import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("schema fields for article pinning are backed by a migration", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migration = readProjectFile(
    "prisma",
    "migrations",
    "20260311050000_add_article_pinning_fields",
    "migration.sql",
  );

  assert.match(schema, /isPinned\s+Boolean/);
  assert.match(schema, /pinnedAt\s+DateTime\?/);
  assert.match(migration, /ALTER TABLE "Article" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;/);
  assert.match(migration, /ALTER TABLE "Article" ADD COLUMN "pinnedAt" DATETIME;/);
  assert.match(migration, /CREATE INDEX "Article_isPinned_pinnedAt_publishedAt_idx"/);
});
