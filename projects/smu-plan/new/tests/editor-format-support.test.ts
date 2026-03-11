import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("editor page exposes markdown editing and html file import controls", () => {
  const editorPage = readProjectFile("src", "app", "(main)", "editor", "page.tsx");
  const editorCss = readProjectFile("src", "app", "(main)", "editor", "page.module.css");

  assert.match(editorPage, /format\s*===\s*"markdown"/);
  assert.match(editorPage, /accept="\.html,text\/html"/);
  assert.match(editorPage, /FileReader/);
  assert.match(editorCss, /\.formatSwitch/);
  assert.match(editorCss, /\.sourceEditor/);
});
