import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(root, relativePath));
}

test("tools page and header only surface currently available tools", () => {
  const toolsPage = read("src/app/(main)/tools/page.tsx");
  const header = read("src/components/organisms/Header.tsx");

  assert.doesNotMatch(toolsPage, /COMING_SOON/);
  assert.match(toolsPage, /\/tools\/evaluation/);
  assert.match(header, /\/tools\/evaluation/);
  assert.doesNotMatch(header, /\/tools\/countdown/);
});

test("desktop header exposes both login and register entry points", () => {
  const header = read("src/components/organisms/Header.tsx");
  const headerCss = read("src/components/organisms/Header.module.css");

  assert.match(header, /href="\/login"/);
  assert.match(header, /href="\/register"/);
  assert.match(headerCss, /\.registerBtn/);
});

test("auth bootstrap uses refresh endpoint to keep sessions alive", () => {
  const authHook = read("src/hooks/useAuth.ts");

  assert.match(authHook, /\/api\/auth\/refresh/);
  assert.match(authHook, /visibilitychange/);
  assert.match(authHook, /focus/);
});

test("verification emails allow log fallback only outside production", () => {
  const mailHelper = read("src/lib/mail/resend.ts");
  const registerRoute = read("src/app/api/auth/register/challenges/route.ts");
  const bindRoute = read("src/app/api/auth/email/bind/request/route.ts");
  const changeRoute = read("src/app/api/auth/email/change/request/route.ts");

  assert.match(mailHelper, /allowVerificationMailDevFallback/);
  assert.match(registerRoute, /allowVerificationMailDevFallback/);
  assert.match(bindRoute, /allowVerificationMailDevFallback/);
  assert.match(changeRoute, /allowVerificationMailDevFallback/);
});

test("2fa schema and routes exist", () => {
  const schema = read("prisma/schema.prisma");
  const securityPage = read("src/app/(main)/settings/security/page.tsx");

  assert.match(schema, /model UserTwoFactor/);
  assert.match(securityPage, /2FA|双重验证|验证器/);
  assert.ok(exists("src/app/api/auth/2fa/setup/route.ts"));
  assert.ok(exists("src/app/api/auth/2fa/enable/route.ts"));
  assert.ok(exists("src/app/api/auth/2fa/disable/route.ts"));
  assert.ok(exists("src/app/api/auth/2fa/recovery/regenerate/route.ts"));
  assert.ok(exists("src/app/api/auth/login/2fa/route.ts"));
});

test("admin navigation no longer exposes retired pages", () => {
  const config = read("src/app/admin/config.ts");

  assert.doesNotMatch(config, /\/admin\/stats/);
  assert.doesNotMatch(config, /\/admin\/logs\/requests/);
  assert.doesNotMatch(config, /\/admin\/logs\/audit/);
  assert.doesNotMatch(config, /\/admin\/bbs/);
});

test("evaluation cron install script exists with daily 22:00 schedule", () => {
  const cronScriptPath = "scripts/install-evaluation-cron.sh";
  assert.ok(exists(cronScriptPath));
  const cronScript = read(cronScriptPath);

  assert.match(cronScript, /CRON_TZ=Asia\/Shanghai/);
  assert.match(cronScript, /0 22 \* \* \*/);
  assert.match(cronScript, /\/api\/tools\/evaluation\/cron/);
});

test("forum theme tweaks are aligned to site brand colors", () => {
  const forumTweaks = read("deploy/flarum/forum-auth-tweaks.sql");

  assert.match(forumTweaks, /#e8652b/i);
  assert.match(forumTweaks, /#16345c/i);
  assert.match(forumTweaks, /#f7f2e8/i);
});
