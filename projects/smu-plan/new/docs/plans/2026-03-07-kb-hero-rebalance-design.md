# KB Hero Rebalance Design

> Date: 2026-03-07
> Scope: knowledge-base landing page visual rebalance

## Context

The first collaboration-focused KB homepage pass improved functionality, but the visual composition is still off:

- the hero headline is oversized and too heavy
- the left column dominates the page while the right column feels decorative
- the hero background mixes too many tones and competes with the content
- the support cards repeat the same bold treatment, so the hierarchy collapses

The user wants the same collaborative message, but with a calmer, more balanced frontend.

## Goals

- Reduce the headline scale and weight so the hero reads like a product page, not a poster.
- Rebalance the hero into a steadier two-column layout.
- Replace the lightweight right-side metric stack with one stronger contribution panel.
- Keep the collaborative positioning explicit without relying on oversized type.
- Preserve the existing article list and create CTA behavior.

## Non-Goals

- No redesign of the article list cards in this task.
- No changes to wiki permissions, search, or data fetching.
- No overhaul of the global site theme tokens.

## Recommended Direction

### Hero composition

- Keep a two-column hero, but narrow the visual gap between the two sides.
- Left column:
  - small kicker
  - medium-sized title in 2 to 3 lines
  - one concise paragraph
  - primary and secondary actions
- Right column:
  - one substantial "how collaboration works" panel
  - three stacked rows for contribution rules and trust signals

This keeps the collaborative story intact while shifting the weight from typography to layout.

### Typography and hierarchy

- Lower the hero title from the current poster scale to a more editorial scale.
- Move body copy and support text to medium weight or normal weight.
- Reserve bold styling for titles, CTA labels, and key numeric/stat labels only.

### Surface treatment

- Remove the competing peach gradient from the hero shell.
- Use the existing warm paper palette with subtle inset contrast and restrained accent tints.
- Make the right-side panel feel anchored with a slightly stronger border/shadow treatment than the support cards below it.

### Supporting cards

- Keep the three collaboration highlights below the hero.
- Reduce their visual weight so they read as supporting reasons, not as competing hero blocks.
- Add a lighter accent treatment to distinguish them from the main contribution panel.

## Testing Strategy

- Update KB config tests so the new panel structure is covered by `node:test`.
- Run the targeted wiki UI test file first.
- Run the full test suite and `tsc --noEmit` after implementation.
- If the local Next runtime is still unreliable, report that browser-level validation remains limited.
