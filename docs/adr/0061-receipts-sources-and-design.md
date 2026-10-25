# ADR-0061: Receipts: keyless sources, binary markets, batch anchors, and a server-rendered web

- **Status:** Accepted; the **Web** part is superseded by [ADR-0064](0064-receipts-kitty-web-with-wallets.md)
- **Date:** 2026-10-24
- **Deciders:** Uy's agent (U11, unattended; Uy reviews in the morning)

## Context
U11 builds Receipts, the Track 1 app ([ADR-0060](0060-build-receipts-and-kitty.md)), overnight. It has no
new keys, so its sources must be keyless. RC0 probed them on Oct 24, 15:00–16:00 UTC:

| Source | What works | Notes |
|---|---|---|
| ESPN scoreboard `site.api.espn.com/apis/site/v2/sports/{basketball/nba,soccer/eng.1}/scoreboard?dates=YYYYMMDD` | Fixtures, status, final scores. Upcoming games carry DraftKings lines | Finished games drop `odds` from the scoreboard. A date range returns HTTP 400 for soccer; ask one day at a time. Send `Accept-Encoding` handling (`--compressed`) |
| ESPN summary `…/summary?event=<id>` | `pickcenter[0]`: DraftKings moneylines, spread and total, **kept after the game** | The backfill's book line |
| Polymarket Gamma `gamma-api.polymarket.com/events?slug=nba-<away>-<home>-<date>` | Each NBA game is an event; its `moneyline` market has outcomes `[away, home]` and CLOB token ids | Polymarket's team codes differ from ESPN's (`nyk` vs `NY`). No EPL game slugs found |
| Polymarket CLOB `clob.polymarket.com/prices-history?market=<token>&startTs&endTs&fidelity=10` | The price before tip-off (Celtics 0.565–0.575 on Oct 23) | Keyless |
| Kalshi `api.elections.kalshi.com/trade-api/v2` | `events?series_ticker=KXNBAGAME`, `markets/<ticker>`, `series/KXNBAGAME/markets/<ticker>/candlesticks` with pre-game prices; `CONTROLS-2026`, `CONTROLH-2026` for the midterms | Keyless. Prices are `*_dollars` strings |
| Polymarket midterms (`tag_slug=midterms`) | House, Senate, key Senate races; end Nov 4 04:59 UTC | Keyless |
| Pyth SUI/USD `PriceInfoObject` on Sui mainnet (`0x801d…6c37`), via Tatum gRPC `GetObject` | Readable | **Stale:** last update Sep 18, 2026 (Pyth on Sui is pull-based). Not usable to resolve price questions |

## Decision
- **Sources:**
  - ESPN for fixtures, results and the book line (DraftKings, vig removed);
  - Polymarket and Kalshi for market prices;
  - Polymarket and Kalshi for the midterms.

  **Sui price questions are deferred:** the only keyless onchain price we found is stale. Sui is
  where picks are *anchored* and *verified*, through Tatum gRPC.
- **Every market is binary:** "Will <home> win?" for games (a draw is "no") and "Will <yes side>?" for
  elections. A voice's number is its probability of "yes". The books' number is the moneyline's implied
  probability, normalised so the outcomes sum to 1.
- **Picks and lock:**
  - a pick is a side and a confidence (50–99%);
  - lock is the event's scheduled start, by the server clock;
  - a pick at or after lock is refused.
- **Anchors** (`receipts::anchor`, new package):
  - the keeper anchors the Merkle root of the picks logged since the last batch, every 10 minutes;
  - the event is `Anchored { root, count, ts_ms, sender, version }`;
  - leaves are `sha256("receipts/v1" ‖ canonical JSON of the pick)`, and inner nodes are
    `sha256(left ‖ right)`, with the last node promoted;
  - `/verify` recomputes the leaf and the proof, reads the transaction's events through Tatum gRPC
    `GetTransaction`, and checks that the root matches and that `ts_ms` is before lock.
- **Scoring:**
  - a Brier score per (voice × league), shrunk toward a coin flip: `(n·brier + 5·0.25) / (n + 5)`;
  - calibration in 10-point confidence buckets;
  - weight ∝ `max(0.25 − shrunk, 0.01)`.
- **Memory** (operator account, mainnet relayer):
  - `receipts:group:<id>:picks`, `…:trust`, `…:radar` and `receipts:member:<id>:insights`;
  - **Receipts' own call takes its weights from the trust snapshots recalled from memory**, not from
    the DB, and cites their blob ids;
  - the DB keeps the numbers and an index of every memory written.
- **Web:** server-rendered with Hono JSX in the same package as the API: forms, inline SVG charts, no
  build step. It replaces the Vite + React web the goal suggested, because it has to be done overnight
  and stay separable. Polishing it is a later UI job.
- **Process:** `apps/receipts` is its own workspace package with its own Postgres schema (`receipts`).
  The bot uses grammY and runs only with `RECEIPTS_BOT=on`; the worker runs only with
  `RECEIPTS_WORKER=on`.

## Consequences
- Judges see bookmakers vs Polymarket vs Kalshi vs the group, scored on real games. The NBA season so far
  (Oct 20–23, 28 games) is the backfill, and it's labelled.
- Sui is used for anchors and verification, not for price data, until a fresh onchain price exists (a
  DeepBook `mid_price` read through simulation is the follow-up).
- The web is plain. Moving to React later is a UI task that doesn't touch the API.

## Links
- [ADR-0060](0060-build-receipts-and-kitty.md), [ADR-0021](0021-sui-grpc-only.md),
  ADR-0058
- Ideas: Receipts
