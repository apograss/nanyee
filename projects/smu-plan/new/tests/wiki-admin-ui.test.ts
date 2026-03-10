import test from "node:test";
import assert from "node:assert/strict";

import { getWikiEditorOptions } from "@/components/organisms/WikiEditor/options";
import { ADMIN_DASHBOARD_CARDS, ADMIN_NAV_ITEMS } from "@/app/admin/config";
import { KB_EDITOR_MODES } from "@/app/(main)/editor/config";
import { KB_COLLAB_HIGHLIGHTS, KB_HERO } from "@/app/(main)/kb/config";
import { canEditArticle } from "@/lib/wiki/permissions";
import { renderArticleBody } from "@/lib/wiki/render";

test("getWikiEditorOptions disables immediate rendering for Tiptap", () => {
  const options = getWikiEditorOptions({
    content: "<p>hello</p>",
    onChange: () => {},
  });

  assert.equal(options.immediatelyRender, false);
  assert.equal(options.content, "<p>hello</p>");
});

test("admin nav excludes retired review and API management surfaces", () => {
  const hrefs = ADMIN_NAV_ITEMS.map((item) => item.href);

  assert.ok(!hrefs.includes("/admin/audit"));
  assert.ok(!hrefs.includes("/admin/apikey"));
  assert.ok(!hrefs.includes("/admin/channels"));
  assert.ok(!hrefs.some((href) => href.includes("VPS_IP")));
});

test("admin dashboard cards exclude legacy API key and token metrics", () => {
  const keys = ADMIN_DASHBOARD_CARDS.map((card) => card.key) as string[];

  assert.ok(keys.includes("totalUsers"));
  assert.ok(keys.includes("totalArticles"));
  assert.ok(!keys.includes("activeKeys"));
  assert.ok(!keys.includes("activeTokens"));
});

test("canEditArticle blocks contributors on locked articles but allows admins", () => {
  const article = {
    authorId: "author-1",
    status: "published",
    isLocked: true,
  };

  assert.equal(
    canEditArticle(article, { userId: "user-1", role: "contributor" }),
    false,
  );
  assert.equal(
    canEditArticle(article, { userId: "admin-1", role: "admin" }),
    true,
  );
});

test("editor modes expose Chinese edit and preview labels", () => {
  assert.deepEqual(
    KB_EDITOR_MODES.map((mode) => mode.label),
    ["编辑", "预览"],
  );
});

test("kb hero config exposes a calmer collaboration panel structure", () => {
  assert.equal(KB_HERO.kicker, "共建知识库");
  assert.ok(KB_HERO.title.includes("南医"));
  assert.equal(KB_HERO.panelTitle, "为什么这里适合共建");
  assert.equal(KB_HERO.panelItems.length, 3);
  assert.equal(KB_COLLAB_HIGHLIGHTS.length, 3);
  assert.ok(KB_HERO.description.includes("登录"));
  assert.ok(KB_HERO.panelItems.some((item) => item.title.includes("版本")));
});

test("renderArticleBody converts markdown and preserves safe html", async () => {
  const markdown = await renderArticleBody({
    content: "## 标题\n\n这里是 **正文**。",
    format: "markdown",
  });
  const html = await renderArticleBody({
    content: "<h2>标题</h2><p>这里是 <strong>正文</strong>。</p>",
    format: "html",
  });

  assert.ok(markdown.includes("<h2>标题</h2>"));
  assert.ok(markdown.includes("<strong>正文</strong>"));
  assert.ok(html.includes("<h2>标题</h2>"));
  assert.ok(html.includes("<strong>正文</strong>"));
});
