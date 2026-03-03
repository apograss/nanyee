# CloudMail OIDC Integration

CloudMail (Hono on CF Workers) OIDC 客户端集成参考。

## 需要修改的文件

1. `src/server/routes/auth.ts` — 新增 OIDC 路由
2. `src/server/index.ts` — 放行 OIDC 回调路由
3. `src/client/src/pages/Login.tsx` — 新增登录按钮
4. `wrangler.toml` — 新增环境变量
5. D1 migration — 新增 nanyee_sub 列

---

## 1. OIDC Routes (`src/server/routes/auth.ts`)

```typescript
import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  OIDC_CLIENT_ID: string;
  OIDC_ISSUER: string;
  OIDC_REDIRECT_URI: string;
}

// PKCE helpers (CF Workers WebCrypto API)
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function registerOidcRoutes(auth: Hono<{ Bindings: Env }>) {
  // GET /api/auth/oidc/login — 发起 OIDC 授权
  auth.get("/oidc/login", async (c) => {
    const state = crypto.randomUUID();
    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    setCookie(c, "oidc_state", state, {
      httpOnly: true, secure: true, sameSite: "Lax", maxAge: 300, path: "/",
    });
    setCookie(c, "oidc_verifier", codeVerifier, {
      httpOnly: true, secure: true, sameSite: "Lax", maxAge: 300, path: "/",
    });

    const url = new URL(`${c.env.OIDC_ISSUER}/api/oauth/authorize`);
    url.searchParams.set("client_id", c.env.OIDC_CLIENT_ID);
    url.searchParams.set("redirect_uri", c.env.OIDC_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return c.redirect(url.toString());
  });

  // GET /api/auth/oidc/callback — 处理回调
  auth.get("/oidc/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) return c.redirect("/login?error=oidc_denied");
    if (!code || !state) return c.redirect("/login?error=oidc_invalid");

    const savedState = getCookie(c, "oidc_state");
    const codeVerifier = getCookie(c, "oidc_verifier");

    if (!savedState || savedState !== state)
      return c.redirect("/login?error=oidc_state_mismatch");
    if (!codeVerifier)
      return c.redirect("/login?error=oidc_verifier_missing");

    const issuer = c.env.OIDC_ISSUER;

    // 1. 用 code 换 token
    const tokenRes = await fetch(`${issuer}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: c.env.OIDC_REDIRECT_URI,
        client_id: c.env.OIDC_CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) return c.redirect("/login?error=oidc_token_failed");

    const tokenData = await tokenRes.json() as { access_token: string; id_token: string };

    // 2. 获取用户信息
    const userinfoRes = await fetch(`${issuer}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoRes.ok) return c.redirect("/login?error=oidc_userinfo_failed");

    const userinfo = await userinfoRes.json() as {
      sub: string; username: string; email?: string; nickname?: string;
    };

    // 3. 查找或创建本地用户
    const db = c.env.DB;
    let localUser = await db
      .prepare("SELECT * FROM users WHERE nanyee_sub = ?")
      .bind(userinfo.sub).first();

    if (!localUser) {
      const id = crypto.randomUUID();
      const username = userinfo.username || `nanyee_${userinfo.sub.slice(0, 8)}`;
      const displayName = userinfo.nickname || username;

      await db.prepare(
        "INSERT INTO users (id, username, display_name, nanyee_sub, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(id, username, displayName, userinfo.sub).run();

      localUser = { id, username, display_name: displayName };
    }

    // 4. 签发 CloudMail JWT (使用现有签发逻辑)
    const jwt = await signCloudMailJWT(localUser, c.env.JWT_SECRET);

    setCookie(c, "token", jwt, {
      httpOnly: true, secure: true, sameSite: "Lax", maxAge: 30 * 24 * 3600, path: "/",
    });
    setCookie(c, "oidc_state", "", { maxAge: 0, path: "/" });
    setCookie(c, "oidc_verifier", "", { maxAge: 0, path: "/" });

    return c.redirect("/");
  });
}
```

---

## 2. 放行路由 (`src/server/index.ts`)

确保 `/api/auth/oidc/*` 在 JWT 中间件的排除列表中:

```typescript
import { registerOidcRoutes } from "./routes/auth";
registerOidcRoutes(auth);
```

---

## 3. Login 按钮 (`src/client/src/pages/Login.tsx`)

```tsx
<div style={{ marginTop: '1rem', textAlign: 'center' }}>
  <div style={{ margin: '0.5rem 0', color: '#666', fontSize: '0.875rem' }}>
    -- or --
  </div>
  <a
    href="/api/auth/oidc/login"
    style={{
      display: 'block', padding: '0.75rem',
      background: '#2563eb', color: 'white',
      borderRadius: '8px', textDecoration: 'none',
      fontWeight: 600, textAlign: 'center',
    }}
  >
    使用 nanyee.de 登录
  </a>
</div>
```

---

## 4. wrangler.toml

```toml
[vars]
OIDC_CLIENT_ID = "cloudmail"
OIDC_ISSUER = "https://nanyee.de"
OIDC_REDIRECT_URI = "https://mail.nanyee.de/api/auth/oidc/callback"
```

---

## 5. D1 Migration

```sql
-- migrations/0003_add_nanyee_sub.sql
ALTER TABLE users ADD COLUMN nanyee_sub TEXT;
CREATE UNIQUE INDEX idx_users_nanyee_sub ON users(nanyee_sub);
```
