/**
 * Apply FTS5 migration script to SQLite database.
 * Run: npx tsx prisma/apply-fts5.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Split SQL that may contain trigger blocks with BEGIN...END;
 * Standard semicolons inside BEGIN...END should not split.
 */
function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = "";
  let inTrigger = false;

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "") {
      continue;
    }
    current += " " + line;

    if (/\bBEGIN\b/i.test(trimmed) && !inTrigger) {
      inTrigger = true;
    }

    if (inTrigger && /\bEND\s*;/i.test(trimmed)) {
      inTrigger = false;
      results.push(current.trim().replace(/;$/, ""));
      current = "";
    } else if (!inTrigger && trimmed.endsWith(";")) {
      results.push(current.trim().replace(/;$/, ""));
      current = "";
    }
  }

  if (current.trim()) {
    results.push(current.trim().replace(/;$/, ""));
  }

  return results.filter((s) => s.length > 0);
}

async function main() {
  const prisma = new PrismaClient();

  const sql = readFileSync(join(__dirname, "fts5.sql"), "utf-8");
  const statements = splitStatements(sql);

  console.log(`Found ${statements.length} statements to execute.\n`);

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      console.log("OK:", stmt.substring(0, 70) + "...");
    } catch (err: any) {
      console.error("FAIL:", stmt.substring(0, 70));
      console.error("  Error:", err?.meta?.message || err?.message || err);
    }
  }

  await prisma.$disconnect();
  console.log("\nFTS5 migration complete.");
}

main();
