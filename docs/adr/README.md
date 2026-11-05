# Architecture Decision Records

These decisions were made in the Remora monorepo and keep their numbers there. Links to Remora docs
that weren't copied are plain text. New decisions continue from 0066; Remora's own ADR-0066 (agents through MCP) is cited by number.

| ADR | Decision |
|---|---|
| [0021](0021-sui-grpc-only.md) | Sui chain access is gRPC only |
| [0060](0060-build-receipts-and-kitty.md) | Build Receipts (Track 1) and Kitty (Track 3) in this monorepo, on Remora's rails |
| [0061](0061-receipts-sources-and-design.md) | Receipts: keyless sources, binary markets, batch anchors, and a server-rendered web |
| [0063](0063-structured-records-skip-dedupe.md) | Receipts and Kitty write structured records without the semantic duplicate check |
| [0064](0064-receipts-kitty-web-with-wallets.md) | Receipts and Kitty: a React web with wallets is the main surface, Telegram is optional |
| [0065](0065-split-receipts-and-kitty-repos.md) | Split Receipts and Kitty into their own public repos |
| [0066](0066-remora-design-system.md) | Receipts' web uses Remora's design system |
| [0067](0067-agents-as-forecasters.md) | Agents as forecasters: owner delegations, agent-signed picks (v3 leaf), stdio and read-only remote MCP, and this repo's own testnet sponsor |
| [0068](0068-mit-license.md) | MIT license, the same as Remora's |
| [0069](0069-turbo-tui-for-dev.md) | `bun run dev` runs the API and the web in Turborepo's TUI |
| [0070](0070-compact-ui.md) | A compact web UI: no card inside a card, and text only where it is needed |
| [0071](0071-visual-hierarchy.md) | One focal point per page, and one primary action in view |
