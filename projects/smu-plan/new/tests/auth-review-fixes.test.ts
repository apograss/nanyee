import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isSafeUploadPath,
} from "@/lib/upload";
import {
  coerceActiveUserContext,
} from "@/lib/auth/guard";
import {
  buildVerificationLookup,
} from "@/lib/auth/verification-records";

const projectRoot = process.cwd();

function readProjectFile(...segments: string[]) {
  return readFileSync(path.join(projectRoot, ...segments), "utf8");
}

test("isSafeUploadPath rejects sibling directories that share the upload prefix", () => {
  const uploadDir = path.join("C:", "var", "app", "data", "uploads");

  assert.equal(
    isSafeUploadPath(uploadDir, ["avatars", "me.png"]),
    path.join(uploadDir, "avatars", "me.png"),
  );

  assert.equal(
    isSafeUploadPath(uploadDir, ["..", "uploads-private", "secret.txt"]),
    null,
  );
});

test("coerceActiveUserContext rejects non-active users and returns current role", () => {
  assert.deepEqual(
    coerceActiveUserContext({
      id: "user_1",
      username: "alice",
      role: "contributor",
      status: "active",
    }),
    {
      userId: "user_1",
      username: "alice",
      role: "contributor",
    },
  );

  assert.equal(
    coerceActiveUserContext({
      id: "user_1",
      username: "alice",
      role: "admin",
      status: "banned",
    }),
    null,
  );

  assert.equal(
    coerceActiveUserContext({
      id: "user_1",
      username: "alice",
      role: "admin",
      status: "deleted",
    }),
    null,
  );
});

test("buildVerificationLookup scopes email verification records by request and purpose", () => {
  assert.deepEqual(
    buildVerificationLookup({
      email: "user@nanyee.edu.cn",
      purpose: "bind",
      requestId: "req_123",
    }, "NOW"),
    {
      email: "user@nanyee.edu.cn",
      purpose: "bind",
      requestId: "req_123",
      usedAt: null,
      expiresAt: { gt: "NOW" },
    },
  );
});

test("email bind and change request routes use verification mail configuration helper", () => {
  const bindRequest = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "email",
    "bind",
    "request",
    "route.ts",
  );
  const changeRequest = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "email",
    "change",
    "request",
    "route.ts",
  );

  assert.match(bindRequest, /isVerificationMailConfigured/);
  assert.match(changeRequest, /isVerificationMailConfigured/);
  assert.doesNotMatch(bindRequest, /process\.env\.RESEND_API_KEY/);
  assert.doesNotMatch(changeRequest, /process\.env\.RESEND_API_KEY/);
});

test("verification routes use scoped lookup helpers and registration defers challenge consumption", () => {
  const registerVerify = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "register",
    "challenges",
    "[id]",
    "verify",
    "route.ts",
  );
  const bindConfirm = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "email",
    "bind",
    "confirm",
    "route.ts",
  );
  const changeConfirm = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "email",
    "change",
    "confirm",
    "route.ts",
  );
  const registerRoute = readProjectFile(
    "src",
    "app",
    "api",
    "auth",
    "register",
    "route.ts",
  );

  assert.match(registerVerify, /buildVerificationLookup/);
  assert.match(bindConfirm, /buildVerificationLookup/);
  assert.match(changeConfirm, /buildVerificationLookup/);

  const firstConsumedAt = registerRoute.indexOf("consumedAt");
  const usernameCheck = registerRoute.indexOf("const existing");
  assert.notEqual(firstConsumedAt, -1);
  assert.notEqual(usernameCheck, -1);
  assert.ok(firstConsumedAt > usernameCheck);
});
