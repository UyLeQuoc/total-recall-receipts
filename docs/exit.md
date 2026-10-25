# Receipts: exits on testnet

What ran, when and with what result. Money and Move are on Sui testnet. Memory is the operator's account
on the Walrus Memory mainnet relayer. Test members and test wallets are generated keys, labelled "(test)"
everywhere. No member pick is presented as a real person's. The agent's picks are real model outputs,
labelled as the agent's.

- **Package:** `receipts::anchor` at `0xc3b4eb9e83f72be63fff68e62245d3fe01289b5c430b706b722f091a1fb5e5a4`
  (testnet, publish digest `5RKauRyJmPxHt4gnA5BeAhaxJRoDYi26GEKbNsWscuVV`, Remora PR #12, 4 Move tests).
- **Gas:**
  - U11 anchors were paid by Remora's sponsor.
  - From U12 on, this repo's own sponsor pays: `0x81b0b7d04f733c0a6d4d3946012daa0cea4cf91e7975a38868f86454dd939e73`,
    funded with 1 SUI by `3GBaACEpdtZ2iWiydfsGrAD786CKM3MXRN6HB2yuvJ3n`
    ([ADR-0067](adr/0067-agents-as-forecasters.md)).

## U11 (Oct 24–25, in the Remora monorepo)

### RC0: keyless sources (Oct 24, 15:55 UTC)
- **ESPN:**
  - the scoreboard gives fixtures, status and scores, plus DraftKings moneylines before a game;
  - the summary's `pickcenter` keeps the line after the game;
  - soccer needs one date per request (a range is HTTP 400).
- **Polymarket:**
  - Gamma `events?slug=nba-<away>-<home>-<date>` (`moneyline` market);
  - CLOB `prices-history` gives the price before tip-off.
- **Kalshi:** `KXNBAGAME-<YY><MON><DD><AWAY><HOME>` with hourly candlesticks; `CONTROLH-2026` and
  `CONTROLS-2026` for the midterms.
- **Pyth SUI/USD on Sui mainnet** reads fine through Tatum gRPC `GetObject`, but it's stale (last update
  Sep 18). Sui price questions are deferred (ADR-0061).

The backfill holds every NBA game from Oct 20 to Oct 23 (28) with all three sources, plus 34 EPL matches
since Sep 19 with the book line. All of it is labelled `backfill`.

### Stage "before" (Oct 24, 16:09–16:12 UTC, 142 s)
Group `40725300-4f45-43b7-bea4-5ea890bdcc99`, test members Ava and Ollie.

| Check | Result |
|---|---|
| Open NBA games with a book line | ✅ 8 games that night (Heat at Hornets … Warriors at Suns) |
| A pick through the (then server-rendered) web form redirects to its receipt | ✅ |
| 16 picks through the API: Ava backs the books' favourite, Ollie the underdog at 90% | ✅ |
| A pick on a locked event is refused | ✅ 409 `locked` |
| The anchor lands on testnet | ✅ `7zvjGFYeLsBUqMuHjZyKdfXrn4seK1qXdDUFp47uWBKE`, 16 picks |
| Verify passes for a real receipt | ❌ then ✅: the first try ran before the fullnode indexed the digest; `anchor()` now waits |
| Verify fails for a tampered receipt (confidence → 0.99) | ✅ the leaf and the proof both fail |
| Learning writes trust snapshots (NBA, EPL) | ✅ blobs `RMODn5ySg_8gntfcCEw-RH2CnXbqN-4WvI2sRbOviYk`, `fW7ckEJ1no3S8GmRbWZo2SxxrmM157fXNWobIl5C3kQ` |
| After learning, the call cites the stored snapshot, and it changed | ✅ Warriors at Suns 0.6294 → 0.6316 |
| The Learning curve shows NBA games | ✅ 28 points, all backfilled |

### Stage "after" (Oct 25, 03:00:17–03:00:25 UTC): all 5 checks pass
- **Five real NBA games resolved:**
  - Wizards at Bulls, WSH 124–120 CHI;
  - Bucks at 76ers, MIL 116–127 PHI;
  - Heat at Hornets, MIA 110–115 CHA;
  - Nets at Cavaliers, BKN 121–125 CLE;
  - Spurs at Mavericks, SA 122–106 DAL.
- **The scores include both test members:**
  - Ava: n 5, 3 hits, Brier 0.143;
  - Ollie: n 5, 2 hits, Brier 0.490;
  - the books: n 33, 22 hits, Brier 0.198.
- **The trust snapshot moved, and the call cites it.** The newest NBA snapshot (as of 02:48Z, 33 events)
  is blob `bBKzCmg0cHKrCnhBKgn0tLxtpG6_05hTrdGDWKOrVXk`. The call for an open NBA game cites it: "Leaning
  on Books (DraftKings) for NBA (22 of 33 right, Brier 0.198)".
- **The nudge fired.** Ollie's insight was "picks at ≥80% hit 2 of 5 (average confidence 90%)". On his
  next sure pick it fired "Your 80%+ picks in NBA have hit 2 of 5. Still 90%?", citing blob
  `nwxTC_dkBkLILvjtcHi0EcoFIakNYrLvfpDh7LarEzs`.
- **Relayer counts:**
  - picks 2, trust 8, radar 0, insights 1, for 11 in all;
  - the 16 exit picks are anchored;
  - most of their `PICK` memories were dropped by the semantic duplicate check before ADR-0063.
- **The radar never fired:** no NBA gap between the books and the markets reached 3 points.

## The web with wallets (ADR-0064, Oct 25)
An injected wallet-standard test wallet signs with a fresh key that holds nothing. No real wallet has
signed yet.
- **01:3x UTC:** a wallet joined "Web e2e (test)" and picked Bournemouth at Man United with a signed
  personal message (pick `4f514cef-ccdc-4c5b-80e1-4410a74825cb`). Its leaf and signature checks passed.
  A copy with one character of the signature changed failed both.
- **After the restyle (ADR-0066):** the same run passed again (pick
  `905148a7-0b25-4bb4-9905-7697c23b4181`, Brighton at Liverpool).

## U12: agents as forecasters (ADR-0067, Oct 25, 03:13:52–03:14:15 UTC, 23 s)
`bunx playwright test -c e2e/playwright.config.ts agents`, run once, passed. The record is
`test-results/u12-exit.json`.

| # | Step | Result |
|---|---|---|
| 1 | Fresh group "Agents U12 10-25 03:13 (test)" (`af4ede20-d0e3-44d1-876f-bd826708f253`); the owner, a test wallet `0x7044…e8c7`, joins with a signature | ✅ |
| 1 | The owner delegates the forecaster (`0x1d4339be445fb699d9097395ae0dd0f64ee3639d984b5e00f83988a489fc668b`) for 7 days from the Agents page; the wallet signs "Receipts: let an agent pick for me" | ✅ delegation `c8528b71-4ff3-4c7a-aebd-13fc2c74c758`, live |
| 2 | The forecaster (google/gemini-2.5-flash through OpenRouter) uses Receipts' stdio MCP server: `list_markets`, `get_call`, then `submit_pick` signed with its own key | ✅ two real EPL games locking Oct 25, 14:00 UTC |
| 2 | Pick 1: Newcastle at C Palace, **Newcastle win or draw at 60%**, "Newcastle has a stronger squad and better form than Crystal Palace, making a win or draw more likely." | ✅ `72242d64-a4f0-4e39-be00-fbd5ae779eb8`, leaf `98a99ad0…`, memory blob `32rKPmOhXiq5EcLKLpvK3sxKgI4d7Y3FkLkbRuUbeeo` |
| 2 | Pick 2: Brentford at Hull, **Brentford win or draw at 80%**, "Brentford is a stronger team than Hull, and the market odds of 0.2 for Hull to win are too low. I expect Brentford to win or draw." | ✅ `c50f46de-2b73-4aa7-bc5c-120a1643c9e1`, leaf `3c63a995…`, memory blob `BY2nZFOBPWy1SxVHIfRbpB-e4ST3_-ngH8uRKs2Tc8U` |
| 3 | Anchored with this repo's sponsor | ✅ `19omKxxkB3djfvX2wpXJq4FAxaFRTtRPS9f888yDiJw`, 2 picks, root `f6171ffb…` |
| 3 | Each receipt verifies | ✅ both: leaf, signed by the agent's key, the owner delegated this agent, the anchor transaction on Sui, the proof reaches the onchain root, anchored before lock |
| 3 | The receipt page shows "Forecaster, agent for Owen (test)", the agent's reason and "Verified on Sui"; a tampered agent signature fails | ✅ |
| 4 | The owner revokes ("Receipts: stop an agent", 03:14:11Z) | ✅ status `revoked` |
| 4 | The forecaster's next pick (Brighton at Liverpool, the model said Liverpool at 55%) is refused through MCP | ✅ "The owner revoked this agent's delegation." |
| 4 | The same pick, signed by the agent's key and posted straight to the API, is refused by the server | ✅ 403 `not_delegated` |

- **Trust snapshot:** no picked game resolved during the run (both lock at 14:00 UTC), so the forecaster
  isn't in a trust snapshot yet. A worker learns it once the games are final.
- **Screenshots** (gitignored), in `apps/receipts/test-results/u12/`:
  - the board, the receipt, the Agents page and the Agents page after the revoke;
  - the receipt, the Agents page (visitor) and the leaderboard again after two layout fixes;
  - each at 1280 and 375 px, light and dark, with no horizontal scroll at 375.
- **Tatum:** one `ExecuteTransaction` and its `GetTransaction` waits for the anchor, plus one
  `GetTransaction` per verify. The sponsor holds 0.999 SUI after the run.
- **Read-only remote MCP:** covered by the DB test `src/agents.db.test.ts`, run against the local
  database:
  - a token created by the owner's signature is stored as a hash;
  - `tools/list` has no `submit_pick`, and `get_receipt` verifies;
  - another group is refused, and a revoked token gets 401.

## Not verified
- A real wallet (Slush) as the owner. Only the injected test wallet has signed.
- zkLogin owners: there's no Enoki key.
- OAuth on the remote MCP server: it takes bearer tokens only.
