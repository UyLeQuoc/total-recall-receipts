# packages/move/receipts

The `receipts` Move package (RC1, [ADR-0061](../../../docs/adr/0061-receipts-sources-and-design.md)) for the Receipts app (`apps/receipts`). `receipts::anchor::anchor(root, count, clock)` emits `Anchored { root, count, ts_ms, sender, version }` for a batch of picks. `/verify` proves a pick against that root and checks that `ts_ms` came before the event locked.

- **Owner:** Uy Le (`@UyLeQuoc`), U11 ([ADR-0060](../../../docs/adr/0060-build-receipts-and-kitty.md))
- **Status:** v1. `sui move test` runs 4 tests. Published on testnet; the id is in `apps/receipts/src/deployments.ts`.
- **Publish (testnet only):** `bun --env-file=.env apps/receipts/scripts/publish.ts`. Mainnet is Uy's call (ADR-0024).
