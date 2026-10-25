# Receipts

**The group-chat pick'em that keeps the receipts.** Friends log picks before lock on the web, signed by
their own wallet, or in Telegram. Each pick is sealed on Sui in a Merkle batch, so nobody can claim "I
called it" afterwards. After
the final whistle, everyone is scored against the books (DraftKings), Polymarket and Kalshi. Receipts
learns who to trust on what, and its own call cites the Walrus Memory it learned that from.

Track 1 (Markets & Sports Prediction). Split out of the Remora monorepo ([ADR-0065](../../docs/adr/0065-split-receipts-and-kitty-repos.md)), first built on Remora's rails
([ADR-0060](../../docs/adr/0060-build-receipts-and-kitty.md)). Design and sources are in
[ADR-0061](../../docs/adr/0061-receipts-sources-and-design.md), and the web with wallets in
[ADR-0064](../../docs/adr/0064-receipts-kitty-web-with-wallets.md). AI agents pick through MCP under
their owner's signed delegation ([ADR-0067](../../docs/adr/0067-agents-as-forecasters.md)).

- **Status:** U11, then U12 (agents). Runs locally on testnet; memory is on the mainnet relayer. The
  exits are in [docs/exit.md](../../docs/exit.md).
- **Owner:** Uy (U11). Entering it as a submission isn't decided (ADR-0060).

## How it works
1. **Markets:**
   - NBA games and EPL matches from ESPN's public scoreboard;
   - the US midterms (Nov 3) from Polymarket and Kalshi.

   Every market is binary: "Will <home> win?" or "Will <yes side>?".
2. **Voices:** the books' moneyline (vig removed), Polymarket's and Kalshi's prices before lock, and each
   member's picks.
3. **Pick before lock.** On the web, your wallet signs the pick; in the group chat, `/pick Celtics 70`.
   A pick at or after the event's start is refused.
4. **Receipt:**
   - an unsigned pick's leaf is `sha256("receipts/v1" ‖ canonical pick)`. A wallet-signed pick's leaf is
     `sha256("receipts/v2" ‖ canonical pick with signer and signature)`, so the anchor also proves the
     signature existed before lock;
   - every 10 minutes, and right away when an event is about to lock, the Merkle root of new picks goes
     onchain through `receipts::anchor` ([packages/move/receipts](../../packages/move/receipts));
   - `/p/<pick>` and `POST /api/verify` check the proof against the transaction's `Anchored` event,
     read through Tatum gRPC, and check that it was anchored before lock. A signed pick also checks the
     signature: the signed message must describe this pick, and the signer's key must have signed it.
5. **Scoring:** a Brier score per (voice × league), shrunk toward a coin flip, plus hits and calibration
   bands.
6. **Learning (Walrus Memory):**
   - after results, a **trust snapshot** per league goes to `receipts:group:<id>:trust`, and a **radar**
     memory (books vs markets when they disagreed) to `…:radar`;
   - **Receipts' own call takes its weights from the snapshot recalled from memory**, not from the
     database, and its 🧠 chips cite the blob;
   - overconfidence becomes an **insight** in `receipts:member:<id>:insights`, and the next sure pick
     recalls it as a nudge.
7. **Learning page:** a walk-forward curve. Each call uses only what was learned before it: Receipts'
   weighted call vs the plain average vs the books. The NBA season so far (Oct 20–23) is backfilled
   with real lines and real results, labelled "backfill".

## Agents (ADR-0067)
An AI agent can pick for you, and its record can't be faked any more than yours can.
1. **Delegate.** On the Agents page (`/g/<id>/agents`), your wallet signs "Receipts: let an agent pick
   for me": the agent's address, its name, and an end date (at most 90 days). The agent joins the group
   as its own voice, labelled "Forecaster, agent for you".
2. **Connect it.** Run the stdio MCP server where the agent runs, with the agent's own key. In Claude
   Code:
   ```bash
   claude mcp add receipts -e RECEIPTS_API_URL=http://localhost:8811 -e RECEIPTS_GROUP=<group id> \
     -e RECEIPTS_AGENT_KEY=<the agent's suiprivkey> -- bun <repo>/apps/receipts/src/mcp/bin.ts
   ```
   - Tools: `list_markets`, `get_call` (Receipts' call and the memory blobs it cites), `submit_pick`,
     `get_receipt` (with every verify check) and `leaderboard`.
   - The key signs each pick on the agent's side; Receipts only checks the signature.
3. **Its picks.** Each pick is signed by the agent's key and names the delegation. It's anchored like
   anyone's, and its leaf is `receipts/v3`. The receipt shows "agent X for Y", the agent's one-line
   reason, what the agent signed and what the owner signed. Verify checks the agent's signature, the
   delegation (signed by the owner, unedited, live at the pick) and the anchor.
4. **Revoke.** One more signature, "Receipts: stop an agent". The next pick is refused, and earlier
   picks stay valid.
5. **Read-only remote MCP.** Cloud agents can read through Streamable HTTP at `/mcp` with a bearer token
   that your wallet creates on the Agents page.
   - The token is shown once, stored as SHA-256, bound to the group, valid for 30 days, revocable, and
     limited to 60 calls a minute.
   - It can't pick: Receipts holds no agent key, so there are no custodial picks.

**Reference agent:** `bun --env-file=../../.env agents/forecaster/run.ts --group <id> --count 2`.
- It starts the stdio server with `RECEIPTS_AGENT_KEY` (`bun scripts/agent-key.ts` generates one) and
  reads the board and Receipts' call.
- An OpenRouter model (`LLM_MODEL`) picks a side, a confidence and a reason, and the agent submits the
  pick. Every pick is a real model output, labelled as the agent's.

## The web (ADR-0064)
A React app in `web/` (Vite, Tailwind, TanStack Query, `@mysten/dapp-kit` on testnet over gRPC-web), in
Remora's design system: its tokens, shadcn kit and sidebar shell, light and dark
([ADR-0066](../../docs/adr/0066-remora-design-system.md)). It uses the same paths the bot links to:

| Path | Page |
|---|---|
| `/` | Groups, and starting one |
| `/g/:id` | The board: every open market with the books, Polymarket, Kalshi, the group and Receipts' call (🧠 chips link the memory). Join with your wallet; pick with a signature |
| `/g/:id/scores` | The leaderboard: Brier, hits, the shrunk trust score, calibration |
| `/g/:id/learning` | Receipts' call vs the plain average vs the books, walking forward (backfill labelled) |
| `/g/:id/memory` | Every memory Receipts wrote for the group |
| `/p/:pick` | The receipt: who signed it, what they signed, the checks against Sui, and "verify a tampered copy" |

**The wallet flow.** Connecting a wallet costs nothing, and Receipts never asks for a transaction.
- **Join:** the wallet signs a personal message naming the group, your name and your address:
  ```
  Receipts: join a group
  group: <id> (<group name>)
  name: Ava
  address: 0x…
  test member: no
  at: 2026-10-25T01:30:00.000Z
  ```
- **Pick:** the wallet signs the pick. The server rebuilds this text from its own records, checks the
  signature (`verifyPersonalMessageSignature`) and that `at` is within 5 minutes, then stores the
  signature in the pick and its leaf:
  ```
  Receipts pick
  group: <id>
  event: espn:nba:401909860 (Warriors at Suns)
  side: yes (Suns win)
  confidence: 72%
  at: 2026-10-25T01:30:00.000Z
  ```
- A member who joined with a wallet must sign every pick (`401 signature_required`). Members without a
  wallet (Telegram users, test members made through the API) pick unsigned, and their receipts say so.
- zkLogin isn't accepted yet: it needs an Enoki key.

The text lives in `src/messages.ts`, which the web imports too, so what the wallet shows can't drift from
what the server checks.

```bash
cd apps/receipts
bun run dev:web     # http://localhost:5181, /api proxied to RECEIPTS_PORT (8811 by default)
bun run build       # web/dist; the API then serves the web itself at http://localhost:8811
bun run e2e         # Playwright: API on 8812, web on 5181 (see below)
```

**E2E** (`e2e/signed-pick.e2e.ts`): an injected wallet-standard test wallet (the pattern of Remora's
`e2e/support/test-wallet.ts`) with a key generated per run that holds nothing. It joins the reused
"Web e2e (test)" group, signs a pick on an upcoming real NBA or EPL game more than 30 minutes before its
lock (so nothing is anchored early), sees the signature check pass on the receipt, and sees a tampered
signature fail. It also checks the board at 375 px for horizontal scroll and opens Learning and the
leaderboard. Screenshots go to `test-results/`.

## Tatum (gRPC only, ADR-0021)
| Call | Where | Why |
|---|---|---|
| `ExecuteTransaction` | `src/chain.ts` | Anchor a batch (testnet; the sponsor key pays) |
| `GetTransaction` (polled by `waitForTransaction`) | `src/chain.ts` | Show a receipt only once the node has it |
| `GetTransaction` (events) | `src/chain.ts` | `/verify`: read the `Anchored` event |
| `GetObject` | RC0 spike | Pyth SUI/USD on Sui; stale, so Sui price questions are deferred (ADR-0061) |

## Memory (operator account, mainnet relayer)
| Namespace | Example |
|---|---|
| `receipts:group:<id>:picks` | `PICK member=… event=espn:nba:401909853 "Heat at Hornets" side=no (Heat win) confidence=0.56 …` |
| `receipts:group:<id>:trust` | `TRUST snapshot league=NBA as_of=… events=28 \| polymarket n=28 brier=0.186 hits=21 w=0.34 \| …` |
| `receipts:group:<id>:radar` | `RADAR league=NBA … disagreements=4 books_closer=3 markets_closer=1` |
| `receipts:member:<id>:insights` | `INSIGHT member=… league=NBA overconfident: picks at >=80% hit 2 of 8 (average confidence 90%)` |

## Run it (agents' e2e)
- `bunx playwright test -c e2e/playwright.config.ts agents` is the U12 exit:
  1. the owner (an injected test wallet) delegates the forecaster;
  2. the forecaster picks two real games through MCP;
  3. they're anchored with this repo's sponsor and verified;
  4. after a revoke, the next pick is refused.
- The record goes to `test-results/u12-exit.json`, with screenshots in `test-results/u12/`.

## Run it
```bash
# from the repo root, with the repo's .env
cd apps/receipts
npx drizzle-kit push                                   # its own `receipts` schema, local DB only
bun --env-file=../../.env scripts/backfill.ts          # NBA since Oct 20 + recent EPL, labelled backfill
RECEIPTS_WORKER=on bun --env-file=../../.env src/main.ts   # API (and the built web) on http://localhost:8811
# the bot: RECEIPTS_BOT=on, only while no other poller uses TELEGRAM_BOT_TOKEN
```
- **Publish** (testnet, already done): `bun --env-file=../../.env scripts/publish.ts`.
- **Exit:**
  - `bun --env-file=../../.env scripts/exit.ts before`, before tonight's games lock;
  - then `… exit.ts after`, once they're final.
- **Tests:** `bun run test`. The database tests skip themselves without Postgres.

## API
| Method | Path | |
|---|---|---|
| `GET` / `POST` | `/api/groups` | List groups; create one |
| `GET` | `/api/groups/:id` | The group and its members (wallet address, Telegram, test) |
| `POST` | `/api/groups/:id/join` | `{ name, address, test, at, signature }`: join with a wallet-signed message |
| `POST` | `/api/groups/:id/members` | A member without a wallet (`test: true` labels it) |
| `GET` | `/api/groups/:id/events` · `/board` | Open markets with each source's number; the board adds labels and the group's picks |
| `POST` | `/api/picks` | `{ groupId, memberId, eventId, side, confidence, signature?, signedAt? }`. 409 `locked` after the start; 401 when a wallet member's signature is missing or wrong |
| `GET` | `/api/groups/:id/picks` | Recent picks: signed, anchored, right or wrong |
| `GET` | `/api/picks/:pick` · `/api/picks/:pick/verify` | The receipt with its labels; the checks |
| `GET` | `/api/groups/:id/calls/:eventId` | Receipts' call, its weights, the snapshot blob, the 🧠 chips |
| `GET` / `POST` | `/api/receipts/:pick` · `/api/verify` | The portable receipt; verify it against Sui |
| `POST` | `/api/anchor[?group=]` · `/api/groups/:id/learn` | Run the anchor batch (optionally one group's) or the learning pass now |
| `GET` | `/api/groups/:id/scores` · `/learning` · `/memories` | Scores, the curve, what was learned |
| `GET` / `POST` | `/api/groups/:id/delegations` | Agents with their record; `{ owner, agent, agentName, until, at, signature }` delegates one (ADR-0067) |
| `POST` | `/api/groups/:id/delegations/:id/revoke` | `{ at, signature }`: the owner's "stop an agent" |
| `GET` | `/api/groups/:id/agents/:address` | An agent's newest delegation and whether it's live (for its MCP server) |
| `POST` | `/api/agent-picks` | `{ groupId, eventId, side, confidence, agent, delegationId, signedAt, signature, note? }`. 403 `not_delegated` once revoked or ended |
| `GET` / `POST` | `/api/groups/:id/mcp-tokens` | Read-only MCP tokens: list them; `{ owner, name, at, signature }` creates one, shown once |
| `POST` | `/api/groups/:id/mcp-tokens/:id/revoke` | `{ at, signature }` |
| `POST` | `/mcp` | Remote MCP (Streamable HTTP, JSON-RPC 2.0), read-only, `Authorization: Bearer <token>` |
