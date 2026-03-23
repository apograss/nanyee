import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("build script ensures standalone static assets are linked after next build", () => {
  const packageJson = readProjectFile("package.json");
  const prepareBuildScript = readProjectFile("scripts", "prepare-build.mjs");
  const helperScript = readProjectFile("scripts", "link-standalone-static.mjs");

  assert.match(packageJson, /node scripts\/prepare-build\.mjs && next build && node scripts\/link-standalone-static\.mjs/);
  assert.match(prepareBuildScript, /removed stale \.next artifacts/);
  assert.match(helperScript, /standaloneStaticDir/);
  assert.match(helperScript, /symlinkTarget/);
});
