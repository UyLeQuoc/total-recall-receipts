# ADR-0070: A compact web UI: no card inside a card, and text only where it's needed

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** huanngdev

## Context
- The web in Remora's design system ([ADR-0066](0066-remora-design-system.md)) looked right, but it had too
  much detail, cards nested in cards, generous padding, and a description under most titles.
- The board had 12 boxes inside other boxes and needed 2711 px at 1280 px wide.

## Decision
The tokens, kit, sidebar and themes stay. The density rules change:
- **A card never sits inside a card.** Inside a block, use spacing, a `border-t` or plain text.
- **Repeating items are rows in one bordered list.** Market cards are the exception.
- **A description stays only if someone can't act correctly without it,** in one short sentence. These stay
  because they carry weight: "Signing costs nothing." before a wallet prompt, "Checked against Sui through
  Tatum." on Verify, and what a tampered copy changes.
- **Tighter scale:** `Page` `gap-4 px-4 py-4 lg:px-6`, `h1` `text-lg`, `h2` `text-sm`, rows `px-3 py-2`. No page
  footer. No arbitrary font sizes.
- **Use the width from `xl`:** the receipt sits beside its checks, and Learning shows leagues in two columns.

## Consequences
- The board has no nested boxes. Receipt, Learning and Agents fit one 1280×800 screen in the states tested.
- Learning's chart text is smaller at two columns, because the SVG scales with its column.
- Hooks, API calls, signing and e2e selectors didn't change.

## Links
- [ADR-0066](0066-remora-design-system.md)
