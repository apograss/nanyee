# OAuth Registration And Nav Design

> Date: 2026-03-08
> Scope: forum OAuth callback reliability, OAuth-only registration posture, main-site API navigation

## Context

The current cross-site auth posture is split across three systems:

- `nanyee.de` is the OIDC provider and main site
- `chat.nanyee.de` is the Flarum forum client
- `api.nanyee.de` is the NewAPI client

The user reported three issues:

- forum OAuth opens a popup but authentication does not complete reliably
- forum/API should allow first-time OAuth account creation, while local password registration should not be the promoted path
- the main site should expose a direct API entry

Root-cause evidence gathered before implementation:

- the forum callback response from Flarum is an inline script that calls `window.opener.app.authenticationComplete(...)`
- Cloudflare Rocket Loader is rewriting that inline callback script on `chat.nanyee.de`, which can delay or break popup completion
- Flarum currently has `allow_sign_up = 0`, which blocks first-time OAuth account creation
- Flarum needs a split-endpoint setup:
  - browser-facing authorization should stay on public `https://nanyee.de/...`
  - server-side token and userinfo requests should use the host-mapped plain-HTTP route that already works inside the container network
- NewAPI already has `oidc.enabled = true`, `passkey.enabled = false`, and `PasswordRegisterEnabled = false`

## Goals

- Make forum OAuth callback execution reliable in a real browser.
- Re-open forum account creation only as needed for OAuth first sign-in.
- Keep local username/password login available on the forum and API site.
- Keep local password registration disabled on the API site.
- Change the forum generic OAuth label from “自定义” to “OAuth”.
- Add a stable API link on the main site, even when custom nav settings already exist.

## Non-Goals

- No redesign of the forum login UI beyond text and signup-entry suppression.
- No change to NewAPI’s local password login behavior.
- No replacement of the current OIDC provider routes or token model.

## Design

### 1. Main-site navigation

- Extract header nav defaults and normalization into a small pure helper.
- Add `https://api.nanyee.de` after the forum link in the default nav.
- If `navLinks` is loaded from settings and the API link is missing, inject it after the forum entry at runtime.

This avoids requiring a production database migration just to expose the new entry.

### 2. Forum OAuth reliability

- Patch Flarum’s popup callback responses so the inline script is emitted with `data-cfasync="false"`.
- Apply the same patch to account-linking callback responses so both auth flows are protected from Rocket Loader.
- Keep the authorization endpoint public on `https://nanyee.de/...`.
- Route Flarum token and userinfo requests to `http://nanyee.de/...`, which resolves to the Docker host mapping inside the forum container and avoids the self-signed HTTPS origin path.

This addresses the two real failure modes:

- the browser callback script was being rewritten by Rocket Loader
- the Flarum container could not exchange codes over HTTPS because its host-mapped path hit a self-signed origin certificate

### 3. OAuth-only registration posture

- Set forum `allow_sign_up = 1` so first-time OAuth login can create accounts.
- Keep NewAPI `PasswordRegisterEnabled = false` and `oidc.enabled = true`.
- Suppress forum local signup affordances in the UI instead of turning sign-up off globally:
  - hide the built-in sign-up entries with forum custom styling
  - change the generic provider translation so the button reads “OAuth 登录”

This keeps the backend permissive enough for OAuth provisioning while steering users away from local password registration.

### 4. Forum text overrides

- Patch the Chinese locale source for FoF OAuth and `blt950/oauth-generic` so:
  - generic provider name becomes `OAuth`
  - generic login button resolves to `OAuth 登录`
- Preserve the rest of the Chinese pack unchanged.

## Testing Strategy

- Add unit tests for nav normalization and API-link insertion.
- Re-run existing OIDC helper tests to ensure the provider-side fixes still hold.
- Verify production flows after deployment:
  - forum `/auth/generic` popup completes and closes
  - forum first-time OAuth login can create a user
  - forum homepage payload reports `allowSignUp: true`
  - NewAPI still reports `oidc_enabled: true` and `PasswordRegisterEnabled: false`
  - main-site header renders an API link
