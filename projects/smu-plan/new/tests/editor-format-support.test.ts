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

  assert.match(editorPage, /isSourceMode/);
  assert.match(editorPage, /accept="\.html,text\/html"/);
  assert.match(editorPage, /FileReader/);
  assert.match(editorCss, /\.formatSwitch/);
  assert.match(editorCss, /\.sourceEditor/);
});

test("wiki toolbar exposes attachment upload controls", () => {
  const toolbar = readProjectFile(
    "src",
    "components",
    "organisms",
    "WikiEditor",
    "Toolbar.tsx",
  );

  assert.match(toolbar, /\/api\/upload\/attachment/);
  assert.match(toolbar, /accept="\.pdf,\.txt,\.zip,\.docx,\.xlsx,\.pptx"/);
  assert.match(toolbar, /insertContent/);
  assert.match(toolbar, /data\.data\.url/);
  assert.match(toolbar, /data\.data\.name/);
});

test("editor supports interactive html and resilient upload parsing", () => {
  const editorPage = readProjectFile("src", "app", "(main)", "editor", "page.tsx");
  const toolbar = readProjectFile(
    "src",
    "components",
    "organisms",
    "WikiEditor",
    "Toolbar.tsx",
  );

  assert.match(editorPage, /interactive-html/);
  assert.match(editorPage, /InteractiveHtmlFrame/);
  assert.match(editorPage, /format !== "html"/);
  assert.match(toolbar, /readApiPayload/);
  assert.match(toolbar, /await response\.text\(\)/);
  assert.match(toolbar, /credentials:\s*"include"/);
});

test("wiki toolbar exposes table row and column management controls", () => {
  const toolbar = readProjectFile(
    "src",
    "components",
    "organisms",
    "WikiEditor",
    "Toolbar.tsx",
  );

  assert.match(toolbar, /addRowAfter/);
  assert.match(toolbar, /addColumnAfter/);
  assert.match(toolbar, /deleteRow/);
  assert.match(toolbar, /deleteColumn/);
  assert.match(toolbar, /deleteTable/);
});
