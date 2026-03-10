# Admin UI Wiki Cleanup Design

> Date: 2026-03-07
> Scope: wiki editor crash, locked-article admin workflow, obsolete admin frontend cleanup

## Context

The project has already moved the knowledge base to a wiki-style editing model, but the admin frontend still exposes legacy review and API-management surfaces. The article editor also crashes when opening Tiptap, and locked articles cannot be practically unlocked from the admin UI.

## Goals

- Fix the Tiptap SSR hydration error on the editor page.
- Let admins open and edit locked articles.
- Add explicit lock/unlock controls to the admin article management screen.
- Remove obsolete admin frontend surfaces for article review and external API management.
- Keep backend APIs and data models intact unless they are required to support the new admin UI.

## Non-Goals

- Do not remove the site AI chat capability.
- Do not drop database tables or backend API routes for provider keys, tokens, or channels in this change.
- Do not redesign the overall admin layout beyond removing obsolete entries and renaming copy where needed.

## Design

### Wiki editor

- Move Tiptap editor options into a small helper module so the SSR-safe configuration is explicit and testable.
- Set `immediatelyRender: false` when constructing the editor.

### Locked article workflow

- Reuse wiki permission logic so admin users can still open locked articles in `/editor?id=...`.
- Update the editor page to read the authenticated user and only block locked articles for non-admin users.
- Keep unauthenticated create/edit attempts blocked by the API, but also make the UI clearer by hiding create affordances when no user is logged in.

### Admin frontend cleanup

- Remove these admin navigation items:
  - `/admin/audit`
  - `/admin/apikey`
  - `/admin/channels`
  - external New-API link
- Remove the dashboard cards for active keys and active tokens.
- Leave the backend routes in place for now so the cleanup is frontend-only and low risk.

### Admin article management

- Treat `/admin/articles` as the single content-management screen for wiki articles.
- Add a visible lock state column/badge.
- Add a row action to lock or unlock an article using the existing admin article PATCH endpoint.
- Keep existing hide/delete actions.

## Testing strategy

- Add pure-node tests for:
  - wiki editor config sets `immediatelyRender: false`
  - admin navigation config excludes obsolete entries
  - admin dashboard card config excludes obsolete API cards
  - wiki permission helper allows admins to edit locked articles and blocks contributors
- Run the full existing `node --test --import tsx tests/*.test.ts`
- Run `npm run build`

