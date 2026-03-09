import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiHomeHtml = readFileSync(
  join(process.cwd(), "public", "api-home.html"),
  "utf8",
);

test("API home page primary CTAs link to the console", () => {
  const consoleHref = 'href="https://api.nanyee.de/console" class="btn btn-p"';
  const matches = apiHomeHtml.match(
    /href="https:\/\/api\.nanyee\.de\/console" class="btn btn-p"/g,
  );

  assert.equal(matches?.length ?? 0, 2);
  assert.ok(apiHomeHtml.includes(consoleHref));
  assert.equal(apiHomeHtml.includes('href="/token" class="btn btn-p"'), false);
});
