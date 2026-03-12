import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("header splits nav and user menu state and uses parent-route active matching", () => {
  const header = readProjectFile("src", "components", "organisms", "Header.tsx");

  assert.match(header, /const \[navOpen, setNavOpen\] = useState\(false\)/);
  assert.match(header, /const \[userMenuOpen, setUserMenuOpen\] = useState\(false\)/);
  assert.match(header, /aria-expanded=\{navOpen\}/);
  assert.match(header, /aria-controls="mobile-nav"/);
  assert.match(
    header,
    /pathname === href \|\| pathname\.startsWith\(`\$\{href\}\/`\)/,
  );
});

test("footer and about page sanitize admin-provided html before rendering", () => {
  const footer = readProjectFile("src", "components", "organisms", "Footer.tsx");
  const about = readProjectFile("src", "app", "(main)", "about", "AboutPageClient.tsx");

  assert.match(footer, /isomorphic-dompurify/);
  assert.match(footer, /DOMPurify\.sanitize\(footerContent\)/);
  assert.match(about, /isomorphic-dompurify/);
  assert.match(about, /DOMPurify\.sanitize\(customHtml\)/);
});

test("key pages export metadata titles and layout loads next/font variables", () => {
  const layout = readProjectFile("src", "app", "layout.tsx");
  const filesWithMetadata = [
    ["src", "app", "(main)", "tools", "page.tsx"],
    ["src", "app", "(main)", "about", "page.tsx"],
    ["src", "app", "(main)", "links", "layout.tsx"],
    ["src", "app", "(main)", "bbs", "page.tsx"],
    ["src", "app", "(main)", "guestbook", "layout.tsx"],
    ["src", "app", "(auth)", "login", "page.tsx"],
    ["src", "app", "(auth)", "register", "page.tsx"],
  ];

  assert.match(layout, /next\/font\/google/);
  assert.match(layout, /Inter/);
  assert.match(layout, /Noto_Sans_SC/);
  assert.match(layout, /JetBrains_Mono/);
  assert.match(layout, /className=\{`\$\{inter\.variable\} \$\{notoSansSC\.variable\} \$\{jetBrainsMono\.variable\}`\}/);

  for (const segments of filesWithMetadata) {
    const content = readProjectFile(...segments);
    assert.match(content, /export const metadata(?:: Metadata)?\s*=\s*\{/);
  }
});

test("links page uses timeout-safe loading and wave one pages consume skeleton blocks", () => {
  const linksPage = readProjectFile("src", "app", "(main)", "links", "page.tsx");
  const guestbookPage = readProjectFile("src", "app", "(main)", "guestbook", "page.tsx");
  const homePage = readProjectFile("src", "app", "(main)", "page.tsx");
  const skeleton = readProjectFile("src", "components", "atoms", "SkeletonBlock.tsx");

  assert.match(linksPage, /AbortController/);
  assert.match(linksPage, /setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
  assert.match(linksPage, /clearTimeout\(timer\)/);
  assert.match(skeleton, /styles\.skeleton/);
  assert.match(guestbookPage, /SkeletonBlock/);
  assert.match(homePage, /SkeletonBlock/);
});

test("footer exposes a guestbook entry and tools page renders coming-soon cards", () => {
  const footer = readProjectFile("src", "components", "organisms", "Footer.tsx");
  const toolsPage = readProjectFile("src", "app", "(main)", "tools", "page.tsx");

  assert.match(footer, /href="\/guestbook"/);
  assert.match(toolsPage, /COMING_SOON/);
  assert.match(toolsPage, /即将推出/);
});
