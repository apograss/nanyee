# Forum, Diff, and Comment Fixes Design

## Goal

Stabilize the forum/homepage integration, remove visible mojibake in navigation, add a usable Wiki diff view, fix paragraph comment placement and publishing, and make forum navigation feel like part of the main site.

## Current Problems

1. Homepage forum preview is wired, but the parser is too naive for Flarum JSON:API and often collapses to an empty state.
2. Header and nav strings still contain mojibake in several visible entry points, including the login button.
3. Wiki history only supports revert; it has no compare view.
4. Paragraph comment buttons are placed outside the article frame, and comment publishing hides failures instead of surfacing them.
5. Forum links still open as an external destination and the bridge pages feel disconnected from the main site.

## Recommended Approach

Use a balanced release fix:

- keep Flarum on `chat.nanyee.de`
- keep homepage/forum integration server-side through the main site preview API
- add a lightweight diff view on the Wiki history page using `jsdiff`
- fix the comment UI and comment-posting chain together
- unify forum entry behavior and bridge pages without attempting `/bbs` subpath migration

This preserves the existing deployment model and avoids a much riskier forum replatforming.

## Design

### 1. Forum Preview Integration

- Continue using `/api/home/preview` as the only homepage data source.
- Update the forum fetch helper to request Flarum discussions with include fields for author context.
- Parse `data` plus `included` instead of assuming nested user objects are always present.
- Prefer latest activity metadata so the homepage reflects live discussions.
- Keep graceful fallback when the forum is unreachable or returns zero discussions.

### 2. Navigation Mojibake Cleanup

- Normalize all visible header/nav labels to proper Chinese strings.
- Audit desktop nav, mobile nav, login CTA, account dropdown, and forum bridge copy together.
- Keep the API link and other recent nav adjustments intact.

### 3. Wiki Diff View

- Add `diff` (jsdiff) as the compare engine.
- Add revision detail loading so the history page can compare actual revision content, not just metadata.
- v1 compare target:
  - current article vs selected revision
  - optionally a second selected revision later, but not required for the first cut
- Compare title and summary with word-level diff.
- Compare article body with line-level diff.
- Show additions and deletions in a dedicated compare panel on the history page.
- Keep revert as a separate, explicit action.

### 4. Paragraph Comment Fixes

- Move paragraph comment buttons inward so they stay inside the article frame on desktop.
- Keep mobile placement separate and conservative.
- Trace the comment POST failure from UI to API before changing behavior.
- Surface request failures in the panel instead of swallowing them.
- Preserve the existing paragraph-anchor mechanism based on `data-article-body`.

### 5. Forum Same-Tab + Main-Site Feel

- Change forum entry behavior from new-tab to same-tab.
- Rework `/bbs` into a proper branded bridge page instead of a hard migration notice.
- Keep `/bbs/[id]` and `/bbs/new` context-aware, preserving intent when jumping into Flarum.
- Reuse the main site palette, button language, and tone for forum-entry surfaces.
- Keep the implementation low-risk: bridge/unification, not forum embedding.

## Testing Strategy

- Unit/source tests for:
  - forum preview parser and homepage preview wiring
  - header/nav Chinese labels
  - diff route/component wiring
  - comment UI positioning and error surfacing
  - same-tab forum navigation
- Browser verification for:
  - homepage forum card
  - header login button text
  - Wiki history compare flow
  - paragraph comment publish flow
  - `/bbs` and forum jump behavior
- Deployment verification on VPS for:
  - build
  - PM2 restart
  - `homepage`, `kb`, `home preview`, and `history` routes
