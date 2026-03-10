import test from "node:test";
import assert from "node:assert/strict";

import {
  getVerificationEmailSubject,
  getVerificationMailConfig,
} from "@/lib/mail/resend";
import {
  decodeBasicClientCredentials,
  resolveOAuthClientCredentials,
} from "@/lib/oidc/client-auth";
import { getOidcEmailClaim } from "@/lib/oidc/claims";
import { extractConsentUser, getConsentUserDisplay } from "@/lib/oidc/consent";
import { buildOidcDiscoveryDocument, resolveOidcAppUrl } from "@/lib/oidc/config";
import { DEFAULT_OAUTH_CLIENTS } from "@/lib/oidc/clients";
import { parseOAuthTokenParams } from "@/lib/oidc/token-params";

test("verification mail config stays lazy and resolves from resend key lists", () => {
  assert.equal(getVerificationMailConfig({}), null);

  const single = getVerificationMailConfig({
    RESEND_API_KEY: "re_single",
  });
  assert.deepEqual(single, {
    apiKey: "re_single",
    from: "nanyee.de <noreply@nanyee.de>",
  });

  const multi = getVerificationMailConfig({
    RESEND_API_KEYS: "re_first, re_second",
    RESEND_FROM: "Nanyee Mail <mailer@nanyee.de>",
  });
  assert.deepEqual(multi, {
    apiKey: "re_first",
    from: "Nanyee Mail <mailer@nanyee.de>",
  });

  assert.equal(
    getVerificationEmailSubject("register", "123456"),
    "[nanyee.de] 注册验证码: 123456",
  );
});

test("oidc discovery document exposes standard provider endpoints", () => {
  const document = buildOidcDiscoveryDocument("https://nanyee.de");

  assert.equal(document.issuer, "https://nanyee.de");
  assert.equal(
    document.authorization_endpoint,
    "https://nanyee.de/api/oauth/authorize",
  );
  assert.equal(document.token_endpoint, "https://nanyee.de/api/oauth/token");
  assert.equal(
    document.userinfo_endpoint,
    "https://nanyee.de/api/oauth/userinfo",
  );
  assert.equal(document.jwks_uri, "https://nanyee.de/api/oauth/jwks");
  assert.ok(document.scopes_supported.includes("openid"));
  assert.ok(document.code_challenge_methods_supported.includes("S256"));
});

test("oidc app urls prefer the configured issuer over request origin", () => {
  const url = resolveOidcAppUrl(
    "/oauth/consent",
    "https://0.0.0.0:3000/api/oauth/authorize?client_id=flarum-chat",
    undefined,
    { OIDC_ISSUER: "https://nanyee.de" },
  );

  assert.equal(url.toString(), "https://nanyee.de/oauth/consent");
});

test("default oauth clients align newapi and flarum integrations", () => {
  const newapi = DEFAULT_OAUTH_CLIENTS.find((client) => client.clientId === "newapi");
  const flarum = DEFAULT_OAUTH_CLIENTS.find(
    (client) => client.clientId === "flarum-chat",
  );

  assert.ok(newapi);
  assert.ok(flarum);
  assert.deepEqual(newapi?.redirectUris, ["https://api.nanyee.de/oauth/oidc"]);
  assert.equal(newapi?.scopes.join(" "), "openid profile email");
  assert.deepEqual(flarum?.redirectUris, ["https://chat.nanyee.de/auth/generic"]);
});

test("oidc token client auth accepts HTTP basic credentials", () => {
  const header = `Basic ${Buffer.from("flarum-chat:flarum-secret-change-me").toString("base64")}`;

  assert.deepEqual(decodeBasicClientCredentials(header), {
    clientId: "flarum-chat",
    clientSecret: "flarum-secret-change-me",
  });

  assert.deepEqual(
    resolveOAuthClientCredentials(
      {
        grant_type: "authorization_code",
        redirect_uri: "https://chat.nanyee.de/auth/generic",
      },
      header,
    ),
    {
      clientId: "flarum-chat",
      clientSecret: "flarum-secret-change-me",
    },
  );
});

test("oidc token params parser accepts form bodies without strict content-type", () => {
  const raw = "grant_type=authorization_code&code=abc123&redirect_uri=https%3A%2F%2Fchat.nanyee.de%2Fauth%2Fgeneric&client_id=flarum-chat";

  assert.deepEqual(parseOAuthTokenParams(raw, null), {
    grant_type: "authorization_code",
    code: "abc123",
    redirect_uri: "https://chat.nanyee.de/auth/generic",
    client_id: "flarum-chat",
  });

  assert.deepEqual(parseOAuthTokenParams(raw, "text/plain"), {
    grant_type: "authorization_code",
    code: "abc123",
    redirect_uri: "https://chat.nanyee.de/auth/generic",
    client_id: "flarum-chat",
  });
});

test("oidc email claims synthesize a stable fallback when user email is missing", () => {
  assert.deepEqual(
    getOidcEmailClaim({
      id: "user_123",
      username: "forumuser",
      email: null,
    }),
    {
      email: "oidc+user_123@users.nanyee.de",
      emailVerified: false,
      synthetic: true,
    },
  );

  assert.deepEqual(
    getOidcEmailClaim({
      id: "user_456",
      username: "realuser",
      email: " RealUser@Example.com ",
    }),
    {
      email: "realuser@example.com",
      emailVerified: true,
      synthetic: false,
    },
  );
});

test("consent page extracts nested auth user payloads safely", () => {
  assert.deepEqual(
    extractConsentUser({
      ok: true,
      data: {
        user: {
          id: "user_1",
          username: "admin",
          nickname: "管理员",
        },
      },
    }),
    {
      id: "user_1",
      username: "admin",
      nickname: "管理员",
    },
  );

  assert.equal(
    extractConsentUser({
      ok: true,
      data: {
        id: "user_2",
        username: "operator",
      },
    })?.username,
    "operator",
  );

  assert.equal(extractConsentUser({ ok: true, data: {} }), null);
});

test("consent page display falls back to username when nickname is absent", () => {
  assert.deepEqual(
    getConsentUserDisplay({
      id: "user_1",
      username: "admin",
      nickname: "",
    }),
    {
      displayName: "admin",
      avatarText: "A",
    },
  );
});
