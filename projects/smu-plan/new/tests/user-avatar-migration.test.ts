import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("user avatar field is backed by a migration", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migration = readProjectFile(
    "prisma",
    "migrations",
    "20260311051000_add_user_avatar_url",
    "migration.sql",
  );

  assert.match(schema, /avatarUrl\s+String\?/);
  assert.match(migration, /ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;/);
});
