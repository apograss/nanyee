# KB Frontend Polish Design

> Date: 2026-03-07
> Scope: editor UX polish, KB homepage collaboration emphasis, article edit CTA emphasis, AI search spot-check

## Context

The wiki-style knowledge base is functionally usable, but the current frontend still feels transitional:

- the editor copy is partially garbled and lacks a preview workflow
- the KB landing page does not clearly communicate that it is a community-built wiki
- the article edit action is too subtle for a collaborative editing product

The user wants a more polished and persuasive knowledge-base frontend, then a quick validation pass against the AI search flow using a provided LongCat key.

## Goals

- Fully localize the editor page UI into clean Chinese copy.
- Add a clear `编辑 / 预览` workflow to the editor.
- Make the KB landing page visually stronger and explicitly collaborative.
- Make the article edit action visually prominent.
- After the UI work, validate the AI search behavior using the provided key.

## Non-Goals

- No changes to article permissions or wiki data model in this task.
- No rebuild of the entire design system.
- No removal of AI search functionality.

## Design Direction

### Editor page

- Keep the current single-page structure, but introduce a compact command bar near the top of the form.
- Add a segmented toggle with two modes:
  - `编辑`
  - `预览`
- Keep the editor mounted for editing mode and render a polished preview panel in preview mode using the same article rendering rules as the KB detail page.
- Improve all visible copy to clean Chinese, including:
  - loading states
  - login gate
  - locked-article messaging
  - field labels and placeholders
- Preserve the admin-specific locked-article notice.

### KB landing page

- Add a strong hero block above the article list.
- The hero should explicitly state:
  - this is a collaboratively built wiki
  - logged-in users can create and improve articles
  - article history makes edits traceable
- Add three concise highlight chips/cards to reinforce the shared-editing model.
- Keep the existing article list below the hero, but make the top of the page feel like a contribution surface rather than a plain archive.

### Article detail edit CTA

- Replace the plain inline edit link with a clear CTA button.
- Keep version history as a secondary action.
- Preserve locked-state visibility in the meta area.

### AI search validation

- Reuse the existing `/api/ai/chat` route.
- Run one or two concise KB-oriented prompts after temporarily injecting the provided LongCat key into the environment for the validation command.
- Treat this as verification only, not a feature change.

## Testing Strategy

- Add small node tests for the new KB hero copy/config and editor mode config.
- Reuse the existing editor-options test.
- Run the full `node --test --import tsx tests/*.test.ts`.
- Run `npx tsc --noEmit`.
- If the local runtime cooperates, smoke-check editor preview and KB page structure. If it does not, report that explicitly.

