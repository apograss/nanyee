import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NAV_LINKS,
  API_NAV_LINK,
  normalizeNavLinks,
} from "@/lib/site/nav";

test("default nav includes the API link after the forum entry", () => {
  const forumIndex = DEFAULT_NAV_LINKS.findIndex(
    (link) => link.href === "https://chat.nanyee.de",
  );
  const apiIndex = DEFAULT_NAV_LINKS.findIndex(
    (link) => link.href === API_NAV_LINK.href,
  );

  assert.notEqual(forumIndex, -1);
  assert.notEqual(apiIndex, -1);
  assert.equal(apiIndex, forumIndex + 1);
});

test("normalizeNavLinks injects the API link after forum when missing", () => {
  const links = normalizeNavLinks([
    { href: "/", label: "首页" },
    { href: "https://chat.nanyee.de", label: "论坛", external: true },
    { href: "/tools", label: "工具" },
  ]);

  assert.deepEqual(
    links.map((link) => link.href),
    ["/", "https://chat.nanyee.de", "https://api.nanyee.de", "/tools"],
  );
});

test("normalizeNavLinks does not duplicate an existing API link", () => {
  const links = normalizeNavLinks([
    { href: "/", label: "首页" },
    { href: "https://chat.nanyee.de", label: "论坛", external: true },
    { href: "https://api.nanyee.de", label: "API", external: true },
    { href: "/about", label: "关于" },
  ]);

  assert.equal(
    links.filter((link) => link.href === "https://api.nanyee.de").length,
    1,
  );
});
