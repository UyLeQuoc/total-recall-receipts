# ADR-0071: One focal point per page, and one primary action in view

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** huanngdev

## Context
- After the density pass ([ADR-0070](0070-compact-ui.md)), everything looked equally important. The board was
  12 identical cards with about 24 filled buttons, so nothing drew the eye.

## Decision
- **One focal point per page:**

  | Page | Focal point |
  |---|---|
  | Board | "Next to lock": the soonest market you haven't picked, with Receipts' call as the largest number |
  | Receipt | The verdict and the claim |
  | Leaderboard | Each league's most trusted voice |
  | Learning | Receipts' Brier, with one factual line against the books |
  | Home | The headline and starting a group |
  | Agents | The delegate form |

- **One filled button per view,** for the main action. Everything else is outline or ghost.
- **The other markets are one aligned list,** grouped by day, so numbers scan by column. A row opens inline with
  `Pick` or `Details`, one at a time. Chips, voices and the form live there.
- **Colour means something.** Primary is the main action, Receipts' call and a selected choice. Amber is under
  3 hours to lock. Green and red are pass/fail and right/wrong. A check that's only waiting for its anchor is a
  neutral clock, not a red ✕.
- **Progressive disclosure:** the members list and "Connect your agent" are closed `<details>`.

## Consequences
- Picking on a market other than the hero takes one more click.
- A market's voices are hidden until its row opens, so `agents.e2e.ts` and `signed-pick.e2e.ts` open the row
  first.
- `components/app/stat-tile.tsx` had no users left and is deleted.

## Links
- [ADR-0066](0066-remora-design-system.md), [ADR-0070](0070-compact-ui.md)
