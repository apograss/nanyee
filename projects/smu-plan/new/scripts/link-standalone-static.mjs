import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const standaloneNextDir = path.join(rootDir, ".next", "standalone", ".next");
const staticDir = path.join(rootDir, ".next", "static");
const standaloneStaticDir = path.join(standaloneNextDir, "static");
const symlinkTarget = "../../static";

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStandaloneStatic() {
  if (!(await pathExists(staticDir)) || !(await pathExists(standaloneNextDir))) {
    return;
  }

  await fs.rm(standaloneStaticDir, { recursive: true, force: true });

  try {
    await fs.symlink(symlinkTarget, standaloneStaticDir, "junction");
    console.log("[link-standalone-static] linked .next/static into standalone bundle");
    return;
  } catch (error) {
    console.warn("[link-standalone-static] symlink failed, falling back to copy:", error);
  }

  await fs.cp(staticDir, standaloneStaticDir, { recursive: true });
  console.log("[link-standalone-static] copied .next/static into standalone bundle");
}

ensureStandaloneStatic().catch((error) => {
  console.error("[link-standalone-static] failed:", error);
  process.exitCode = 1;
});
