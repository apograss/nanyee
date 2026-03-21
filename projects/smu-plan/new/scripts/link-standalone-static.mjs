import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");
const staticDir = path.join(rootDir, ".next", "static");
const standaloneStaticDir = path.join(standaloneNextDir, "static");
const symlinkTarget = "../../static";

const publicDir = path.join(rootDir, "public");
const standalonePublicDir = path.join(standaloneDir, "public");

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

async function ensureStandalonePublic() {
  if (!(await pathExists(publicDir)) || !(await pathExists(standaloneDir))) {
    return;
  }

  await fs.rm(standalonePublicDir, { recursive: true, force: true });

  try {
    await fs.symlink("../../public", standalonePublicDir, "junction");
    console.log("[link-standalone-static] linked public/ into standalone bundle");
    return;
  } catch (error) {
    console.warn("[link-standalone-static] public symlink failed, falling back to copy:", error);
  }

  await fs.cp(publicDir, standalonePublicDir, { recursive: true });
  console.log("[link-standalone-static] copied public/ into standalone bundle");
}

Promise.all([
  ensureStandaloneStatic(),
  ensureStandalonePublic(),
]).catch((error) => {
  console.error("[link-standalone-static] failed:", error);
  process.exitCode = 1;
});
