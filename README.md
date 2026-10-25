# Receipts

**The group-chat pick'em that keeps the receipts.** Friends log picks before lock, each signed by their own wallet. Every pick is sealed on Sui in a Merkle batch, so nobody can claim "I called it" afterwards. After the final whistle, everyone is scored against the books, Polymarket and Kalshi. Receipts learns who to trust on what, and its own call cites the Walrus Memory it learned that from.

Built for the Walrus × Tatum **Total Recall** hackathon, Track 1 (Markets & Sports Prediction). Sui runs on testnet, the memory is
[Walrus Memory](https://memory.walrus.xyz) on mainnet, and every Sui call goes through
[Tatum](https://tatum.io)'s gRPC gateway.

**AI agents pick too.** An owner's wallet signs a delegation, and the agent signs its own picks through
Receipts' MCP server. Its record is anchored and scored like anyone's, so nobody can fake an agent's
track record either ([ADR-0067](docs/adr/0067-agents-as-forecasters.md)).

- **The app, its Tatum calls, its memory design and its agents:** [apps/receipts/README.md](apps/receipts/README.md)
- **The exits** (U11, the wallet web, U12 agents): [docs/exit.md](docs/exit.md)
- **The Move package:** [packages/move/receipts](packages/move/receipts), on testnet at `0xc3b4eb9e83f72be63fff68e62245d3fe01289b5c430b706b722f091a1fb5e5a4`
- **Decisions:** [docs/adr](docs/adr/README.md)

## Run it locally
Needs Bun 1.3.14, Node 24, Docker, and the Sui CLI for Move tests.
```bash
cp .env.example .env              # fill in the Walrus Memory, Tatum and sponsor values; never commit it
docker compose up -d              # Postgres on localhost:5435
npx -y bun@1.3.14 install
bun run db:push                   # the app's own `receipts` schema
bun run dev                       # the API on http://localhost:8811
bun run dev:web                   # the web on http://localhost:5181 (/api → 8811)
```
`bun run build` writes `apps/receipts/web/dist`, and the API then serves the web itself on 8811.
The app README has the worker, the bot and the end-to-end run.

## Layout
| Path | What |
|---|---|
| `apps/receipts` | API, worker, Telegram bot (optional) and the React web (`web/`), Playwright e2e (`e2e/`) |
| `packages/move/receipts` | The Move package (`sui move test`) |
| `packages/chain` | `@total-recall/chain`: the Tatum gRPC client (paced, retried, usage counted) |
| `packages/memory` | `@total-recall/memory`: the Walrus Memory client (scopes, write policy, recall) |

## Checks
```bash
bun run lint && bun run typecheck && bun run test && bun run build
(cd packages/move/receipts && sui move test)
```
CI runs the same on every push.

## Origin
Split on Oct 25, 2026 out of our Remora monorepo (Track 2), at commit `7b3a66e`
([ADR-0065](docs/adr/0065-split-receipts-and-kitty-repos.md)). `packages/chain` and `packages/memory` are
copies of Remora's packages, which were ported from hippo, our earlier Walrus Memory chatbot (disclosed
prior work).

## License
[MIT](LICENSE) ([ADR-0068](docs/adr/0068-mit-license.md)). The parts copied from Remora are under the same terms.
