# ADR-0069: `bun run dev` runs the API and the web in Turborepo's TUI

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** Uy

## Context
- `bun run dev` started only the API, through `bun run --filter`. The web needed a second terminal, and
  there was no way to switch between their logs.
- Turborepo's terminal UI shows one log per task and switches between them. It's off by default
  (`"ui": "stream"`).
- `@receipts/app` is the only package with dev scripts, so its two panes are tasks, not packages:
  `dev` (the API) and `dev:web`.

## Decision
- The root `dev` script is `turbo run dev dev:web --ui=tui --env-mode=loose`. `dev:web` is a persistent,
  uncached task in `turbo.json`, like `dev`.
- **`--ui=tui` on the script, not `"ui": "tui"` in `turbo.json`:** `lint`, `typecheck`, `test` and `build`
  keep their plain log output.
- **`--env-mode=loose`:** Turborepo's default strict mode would hide shell variables such as
  `RECEIPTS_PORT` from the tasks. These tasks are never cached, so loose mode costs nothing.

## Consequences
- One command runs both, and `Ctrl+C` stops both. `bun run dev:web` still runs the web alone, but it
  fails on the taken port (`strictPort`) while `bun run dev` is running.
- Without a terminal, Turborepo falls back to stream output.

## Links
- https://turborepo.dev/docs/reference/configuration
- https://turborepo.dev/docs/crafting-your-repository/developing-applications
- https://turborepo.dev/docs/reference/run
