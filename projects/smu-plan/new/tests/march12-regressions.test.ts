import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  API_NAV_LINK,
  DEFAULT_NAV_LINKS,
  GUESTBOOK_NAV_LINK,
  normalizeNavLinks,
} from "@/lib/site/nav";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("default nav places guestbook between links and about and normalize keeps api placement", () => {
  const hrefs = DEFAULT_NAV_LINKS.map((link) => link.href);
  const guestbookIndex = hrefs.indexOf(GUESTBOOK_NAV_LINK.href);
  const linksIndex = hrefs.indexOf("/links");
  const aboutIndex = hrefs.indexOf("/about");
  const apiIndex = hrefs.indexOf(API_NAV_LINK.href);
  const forumIndex = hrefs.indexOf("/bbs");

  assert.equal(guestbookIndex, linksIndex + 1);
  assert.equal(aboutIndex, guestbookIndex + 1);
  assert.equal(apiIndex, forumIndex + 1);

  const normalized = normalizeNavLinks([
    { href: "/", label: "首页" },
    { href: "https://chat.nanyee.de", label: "论坛", external: true },
    { href: "/links", label: "链接" },
    { href: "/about", label: "关于" },
  ]);

  assert.deepEqual(
    normalized.map((link) => link.href),
    ["/", "/bbs", "https://api.nanyee.de", "/links", "/guestbook", "/about"],
  );
});

test("knowledge base leaderboard only renders on the root all-articles view", () => {
  const kbPage = readProjectFile("src", "app", "(main)", "kb", "page.tsx");

  assert.match(kbPage, /const showLeaderboard = !q && !category && !tag/);
  assert.match(kbPage, /showLeaderboard \? getWikiLeaderboard\(\) : Promise\.resolve\(null\)/);
  assert.match(kbPage, /showLeaderboard \? \(/);
});

test("login page safely handles non-json server errors", () => {
  const loginPage = readProjectFile("src", "app", "(auth)", "login", "LoginPageClient.tsx");

  assert.match(loginPage, /const text = await res\.text\(\)/);
  assert.match(loginPage, /JSON\.parse\(text\)/);
  assert.match(loginPage, /登录服务暂时不可用/);
});
