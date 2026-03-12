import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("schema and api surface support persisted conversations and announcement reads", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(schema, /model Conversation\s*\{/);
  assert.match(schema, /messagesJson\s+String/);
  assert.match(schema, /lastReadAnnouncementAt\s+DateTime\?/);

  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "conversations", "route.ts")),
    true,
  );
  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "conversations", "[id]", "route.ts")),
    true,
  );
  assert.equal(
    existsSync(path.join(projectRoot, "src", "app", "api", "announcements", "read", "route.ts")),
    true,
  );
});

test("homepage chat stack uses persisted conversations, toc, and announcement bell", () => {
  const useChat = readProjectFile("src", "hooks", "useChat.ts");
  const homePage = readProjectFile("src", "app", "(main)", "page.tsx");
  const articlePage = readProjectFile("src", "app", "(main)", "kb", "[slug]", "page.tsx");
  const header = readProjectFile("src", "components", "organisms", "Header.tsx");

  assert.match(useChat, /conversationId/);
  assert.match(useChat, /\/api\/conversations/);
  assert.match(homePage, /ConversationSidebar/);
  assert.match(articlePage, /TableOfContents/);
  assert.match(header, /AnnouncementBell/);
});
