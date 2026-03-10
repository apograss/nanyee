# Auth And OIDC Repair Design

> Date: 2026-03-08
> Scope: registration reliability, email sending, OIDC discovery, OAuth client alignment

## Context

The login flow works, but the newly rebuilt registration and OAuth/OIDC stack still has integration gaps:

- registration challenge creation crashes when `RESEND_API_KEY` is missing, even for quiz-based registration
- several registration and verification responses contain mojibake instead of readable Chinese
- the OIDC provider exposes authorize, token, userinfo, and jwks routes, but does not yet expose a standard discovery document
- OAuth clients for `newapi` and `flarum-chat` exist in seed code, but the redirect alignment is not fully settled and the local database is empty

The user wants the registration system repaired, Resend adjusted using the previously deployed Cloudflare mail service as implementation reference, and the OIDC provider made ready for `api.nanyee.de` and later `chat.nanyee.de`.

## Goals

- Make registration challenge routes load safely even when no email provider key is configured.
- Keep quiz registration usable in development without requiring mail secrets.
- Replace broken registration-related Chinese copy with readable strings.
- Add a standard OIDC discovery endpoint at `/.well-known/openid-configuration`.
- Align OAuth client seed definitions with the intended `newapi` and `flarum-chat` integrations.

## Non-Goals

- No full end-to-end deployment of `chat.nanyee.de` in this task.
- No redesign of the auth UI beyond message correctness.
- No replacement of the current session model.

## Design

### Email sending

- Remove the top-level Resend SDK initialization pattern that throws during module evaluation.
- Replace it with a lazy mail helper inspired by the CloudMail Worker approach:
  - resolve provider config only inside the send function
  - support both `RESEND_API_KEY` and `RESEND_API_KEYS`
  - send via direct `fetch` to the Resend API instead of a constructor that fails at import time
- Keep the existing route behavior:
  - if a provider is configured, send the verification email
  - if not configured, allow local development and log the code server-side

### Registration flow

- Preserve the new `challenge -> verify -> register` structure.
- Fix user-facing response text in:
  - registration challenge creation
  - challenge verification
  - verification email subjects/body
- Do not change the validation thresholds or challenge data model.

### OIDC discovery

- Add a small OIDC config helper that derives the public issuer from:
  - `OIDC_ISSUER`, if configured
  - otherwise the incoming request origin
- Publish a discovery document at `/.well-known/openid-configuration` that points to:
  - `/api/oauth/authorize`
  - `/api/oauth/token`
  - `/api/oauth/userinfo`
  - `/api/oauth/jwks`
- Include the minimum metadata needed by standard OIDC clients such as NewAPI and Flarum plugins.

### OAuth client alignment

- Extract default OAuth client definitions into a shared helper so seed values are testable.
- Align `newapi` to the callback path the user is actually configuring: `https://api.nanyee.de/oauth/oidc`
- Keep `flarum-chat` as a seeded client with a documented provisional callback on `chat.nanyee.de`, since final callback shape still depends on the installed Flarum extension.

## Testing Strategy

- Add unit tests for:
  - mail provider config resolution without eager failure
  - OIDC discovery document generation
  - default OAuth client seed definitions
- Run targeted flow verification scripts for:
  - login/session behavior
  - registration challenge loading
  - OIDC discovery output
- Run `node --test --import tsx tests/*.test.ts` and `npx tsc --noEmit`.
