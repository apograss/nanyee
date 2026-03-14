import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  ARTICLE_ATTACHMENT_RULES,
  buildStorageObjectKey,
  buildStoragePublicUrl,
} from "@/lib/upload";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("upload helpers build S3 object keys and public URLs for wiki assets", () => {
  assert.equal(
    buildStorageObjectKey("wiki-images", "diagram.png"),
    "wiki/images/diagram.png",
  );
  assert.equal(
    buildStorageObjectKey("wiki-attachments", "lecture-notes.pdf"),
    "wiki/attachments/lecture-notes.pdf",
  );
  assert.equal(
    buildStorageObjectKey("avatars", "me.webp"),
    "avatars/me.webp",
  );

  assert.equal(
    buildStoragePublicUrl("https://s3.hi168.com", "hi168-29632-0447kuis", "wiki/images/diagram.png"),
    "https://s3.hi168.com/hi168-29632-0447kuis/wiki/images/diagram.png",
  );
});

test("attachment upload rules allow common wiki file formats", () => {
  assert.equal(ARTICLE_ATTACHMENT_RULES.maxSize, 20 * 1024 * 1024);
  assert.deepEqual(
    ARTICLE_ATTACHMENT_RULES.allowedTypes,
    [
      "application/pdf",
      "text/plain",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  );
});

test("wiki attachment upload route exists and returns uploaded url plus filename", () => {
  const routePath = path.join(
    projectRoot,
    "src",
    "app",
    "api",
    "upload",
    "attachment",
    "route.ts",
  );

  assert.equal(existsSync(routePath), true);

  const routeSource = readProjectFile(
    "src",
    "app",
    "api",
    "upload",
    "attachment",
    "route.ts",
  );

  assert.match(routeSource, /ARTICLE_ATTACHMENT_RULES/);
  assert.match(routeSource, /data:\s*\{\s*url,\s*name:/);
});
