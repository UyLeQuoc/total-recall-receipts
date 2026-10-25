# ADR-0066: Receipts' web uses Remora's design system

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Uy

## Context
The wallet web ([ADR-0064](0064-receipts-kitty-web-with-wallets.md)) shipped with its own look:
- receipt paper and ink;
- hand-written hex colours;
- a top bar with tabs.

On Oct 25 Uy asked for both apps to follow Remora's style ("dựa theo style remora, update UI cho 2 app kia
luôn"). Remora's web is Huấn's design. Its tokens are Remora ADR-0036 and ADR-0039: warm neutrals and one
electric indigo accent. It also has a shadcn new-york kit, page components and an inset sidebar shell.

## Decision
- **Tokens:**
  - `web/src/index.css` copies Remora's `:root`, `.dark` and `@theme inline` blocks, `tw-animate-css`
    and the base layer;
  - colours are tokens only;
  - the learning curve uses the chart tokens: the call is `--chart-1` (indigo) and the books are
    `--chart-3`.
- **Kit:** the shadcn components Receipts uses are copied from Remora's `apps/web/src/components/ui`
  into `web/src/components/ui`, each with a comment naming its source:
  - button, card, badge, input, label, separator, sheet, sidebar, tooltip, skeleton, dropdown-menu,
    empty and table;
  - Remora's `use-mobile` hook.

  Biome skips the copied folder, as Remora's config does. `StatTile` and `EmptyState` are copied, and
  `Page`, `PageHeader` and `Section` follow Remora's.
- **Shell:** Remora's layout:
  - an inset sidebar holding the logo, "All groups", the current group's pages (Board, Leaderboard,
    Learning, Memory) and the other groups;
  - the wallet in the sidebar footer, with the theme and Disconnect in its menu;
  - a top bar with the sidebar toggle and a "Testnet" network pill.

  On a phone the sidebar is a sheet, and a group's pages also get a segmented row under the title.
- **Themes:** light, dark and system. Remora's pre-paint script runs in `index.html` under the key
  `receipts.theme`.
- **Logo:** Remora's lockup with Receipts' own mark: a white receipt on a rounded indigo tile, with the
  word "receipts" in lowercase. The favicon matches it.
- **Dependencies:** pinned to the versions in Remora's lockfile:
  - `class-variance-authority` 0.7.1, `cn` 0.4.0, `lucide-react` 0.577.0 and `radix-ui` 1.6.7;
  - `tw-animate-css` 1.4.0 (dev).
- **Unchanged:**
  - every feature, the signed-pick flow and the API;
  - the labels the e2e relies on;
  - the confidence control, which stays a native range input.

## Consequences
- Receipts looks like Remora's product family. Kitty adopts the same system in its own repo.
- The kit is a copy. Remora's later kit fixes are ported by hand ([ADR-0065](0065-split-receipts-and-kitty-repos.md)).
- The JS bundle grows by about 130 kB, to 980 kB, from Radix and lucide. It's still one chunk for a
  local app.
