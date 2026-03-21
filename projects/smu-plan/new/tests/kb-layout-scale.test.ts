import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("knowledge base layout is enlarged and sidebar sits flush to the left edge", () => {
  const pageCss = readProjectFile("src", "app", "(main)", "kb", "page.module.css");
  const sidebarCss = readProjectFile("src", "app", "(main)", "kb", "KBSidebar.module.css");
  const cardCss = readProjectFile("src", "components", "molecules", "ArticleCard.module.css");
  const heroCss = readProjectFile("src", "app", "(main)", "kb", "KBHeroBanner.module.css");

  assert.match(pageCss, /\.layout\s*\{[\s\S]*max-width:\s*none;/);
  assert.match(pageCss, /\.layout\s*\{[\s\S]*margin:\s*0;/);
  assert.match(sidebarCss, /\.sidebar\s*\{[\s\S]*width:\s*252px;/);
  assert.match(cardCss, /\.thumb\s*\{[\s\S]*height:\s*48px;/);
  assert.match(cardCss, /\.titleRow\s*\{[\s\S]*font-size:\s*15px;/);
  assert.match(heroCss, /\.title\s*\{[\s\S]*font-size:\s*19px;/);
});
