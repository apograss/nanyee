# Maintenance, CloudMail Gateway, And Flarum Rollout Design

> Date: 2026-03-08
> Scope: production maintenance mode, CloudMail-based verification email delivery, Flarum deployment, OIDC rollout

## Context

The production topology is now split across three surfaces:

- `nanyee.de` is the main Next.js site and OIDC provider
- `api.nanyee.de` is the NewAPI client that needs OIDC login
- `chat.nanyee.de` now points to the VPS and needs a fresh Flarum deployment

The user wants the main site content put into maintenance mode while work happens, but the authentication and OIDC flows must remain online so NewAPI and future Flarum login do not break. They also want verification email delivery to move fully behind CloudMail instead of the main site talking to Resend directly.

## Goals

- Put the main site frontend into maintenance mode without breaking auth or OIDC.
- Route verification emails through CloudMail instead of direct provider access in the main site.
- Keep `api.nanyee.de` able to authenticate against `nanyee.de` via OIDC.
- Deploy a working Flarum instance on `chat.nanyee.de`.
- Prepare or complete the Flarum login integration using the same OIDC provider where technically feasible.

## Non-Goals

- No broad redesign of the main site during this rollout.
- No shutdown of the OIDC provider.
- No migration of NewAPI itself off the current VPS deployment.

## Recommended Architecture

### 1. Maintenance mode with route allowlist

`nanyee.de` should be placed behind an nginx maintenance rule that serves a static maintenance page for normal content routes but still proxies the Next.js app for:

- `/login`
- `/register`
- `/oauth/consent`
- `/api/*`
- `/.well-known/openid-configuration`
- `/_next/*`
- favicon / manifest / robots / sitemap

This keeps login, consent, token exchange, and static assets working while hiding the public content surface.

### 2. CloudMail as internal verification-email gateway

The main site should stop talking to Resend directly. Instead:

- CloudMail gets a small internal endpoint dedicated to verification-email sending.
- The endpoint authenticates requests with a shared secret header.
- CloudMail continues to own provider selection and secrets (`RESEND_API_KEYS`, `MAILJET_API_KEYS`).
- The main site mail helper becomes a thin client that POSTs to the CloudMail gateway.

This makes email delivery consistent with the user’s desired operational boundary: mail leaves through CloudMail, not the site app.

### 3. OIDC provider remains on the main site

The existing OIDC provider on `nanyee.de` stays authoritative. NewAPI and Flarum should both consume:

- `https://nanyee.de/.well-known/openid-configuration`

Client alignment:

- `newapi`
  - redirect URI: `https://api.nanyee.de/oauth/oidc`
- `flarum-chat`
  - provisional redirect URI depends on the installed Flarum auth extension and must be confirmed after deployment

### 4. Flarum deployment model

Deploy Flarum on the VPS as an isolated Docker Compose stack:

- `flarum`
- `mariadb`
- optional `redis` only if the selected extension set needs it

nginx should reverse proxy `chat.nanyee.de` to the container.

## Risk Notes

### Maintenance mode risk

If `/login`, `/register`, `/oauth/consent`, or `/.well-known/openid-configuration` are accidentally covered by the maintenance rule, OIDC login will fail even though `/api/oauth/*` still exists. The allowlist must be explicit and tested.

### Flarum auth-extension risk

Flarum OIDC support is extension-dependent. The final callback path cannot be treated as settled until the actual extension is installed and inspected. If the preferred OIDC extension is unavailable or unsuitable, deployment should still complete for Flarum itself, and the auth integration should be reported with the exact blocker.

### Secrets and deployment risk

The CloudMail shared secret and any Flarum app secrets must be kept out of committed files and stored only in runtime config.

## Testing Strategy

- Local:
  - unit tests for mail gateway client config and maintenance-route behavior helpers
  - auth + OIDC flow verification against local Next server
- CloudMail:
  - direct HTTP test against the new internal verification-email endpoint
- VPS:
  - `curl` verification for maintenance allowlist and blocked routes
  - end-to-end OIDC login test for `api.nanyee.de`
  - Flarum health and login checks on `chat.nanyee.de`
