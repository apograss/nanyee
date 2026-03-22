import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("mobile nav includes account actions for guests and signed-in users", () => {
  const source = read("src/components/organisms/Header.tsx");
  assert.match(source, /styles\.mobileAuth/);
  assert.match(source, /href="\/login"/);
  assert.match(source, /href="\/settings"/);
});

test("homepage mobile styles reflow search controls instead of shrinking desktop layout", () => {
  const css = read("src/app/(main)/page.module.css");
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.searchBox\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.searchModes\s*\{[\s\S]*?width:\s*100%/);
});

test("homepage chat mode keeps conversation history reachable on mobile", () => {
  const source = read("src/app/(main)/page.tsx");
  assert.match(source, /styles\.historyToggle/);
  assert.match(source, /styles\.mobileConversationOverlay/);
});

test("kb list mobile styles stack sort controls vertically", () => {
  const css = read("src/app/(main)/kb/page.module.css");
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.sortRow\s*\{[\s\S]*?flex-direction:\s*column;/);
});

test("editor mobile styles let mode controls wrap and reduce source editor height", () => {
  const css = read("src/app/(main)/editor/page.module.css");
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.modeSwitch,[\s\S]*?\.formatSwitch\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.sourceEditor\s*\{[\s\S]*?min-height:\s*360px;/);
});

test("guestbook mobile styles stack the header and tighten the danmaku area", () => {
  const css = read("src/app/(main)/guestbook/page.module.css");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.headerRow\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.danmakuArea\s*\{[\s\S]*?height:\s*180px;/);
});

test("tool cards gain a compact mobile layout instead of only shrinking text", () => {
  const css = read("src/components/molecules/ToolCard.module.css");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.card\s*\{[\s\S]*?padding:/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.icon\s*\{[\s\S]*?font-size:/);
});
