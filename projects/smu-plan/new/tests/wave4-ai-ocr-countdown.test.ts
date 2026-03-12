import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("countdown page is backed by static calendar data", () => {
  const countdownPage = readProjectFile("src", "app", "(main)", "tools", "countdown", "page.tsx");
  const calendarPath = path.join(projectRoot, "data", "academic-calendar.json");

  assert.equal(existsSync(calendarPath), true);
  assert.match(countdownPage, /export const revalidate = 86400/);
  assert.match(countdownPage, /academic-calendar\.json/);
});

test("ai stack gates image input behind capabilities and routes imageBase64 through the api", () => {
  const homePage = readProjectFile("src", "app", "(main)", "page.tsx");
  const useChat = readProjectFile("src", "hooks", "useChat.ts");
  const aiRoute = readProjectFile("src", "app", "api", "ai", "chat", "route.ts");

  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "ai", "capabilities", "route.ts")),
    true,
  );
  assert.match(homePage, /visionEnabled/);
  assert.match(homePage, /imageAttachment/);
  assert.match(homePage, /\/api\/ai\/capabilities/);
  assert.match(useChat, /imageBase64/);
  assert.match(aiRoute, /imageBase64/);
  assert.match(aiRoute, /AI_VISION_MODEL/);
});

test("chat responses render dedicated source cards for references", () => {
  const chatStream = readProjectFile("src", "components", "organisms", "ChatStream.tsx");

  assert.equal(
    existsSync(path.join(projectRoot, "src", "components", "molecules", "SourceCard.tsx")),
    true,
  );
  assert.match(chatStream, /SourceCard/);
});

test("ocr feedback is stored through api and visible in admin dataset tools", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const adminConfig = readProjectFile("src", "app", "admin", "config.ts");

  assert.match(schema, /model OcrSample\s*\{/);
  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "ocr", "feedback", "route.ts")),
    true,
  );
  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "admin", "ocr-dataset", "page.tsx")),
    true,
  );
  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "admin", "ocr-dataset", "route.ts")),
    true,
  );
  assert.match(adminConfig, /\/admin\/ocr-dataset/);
});
