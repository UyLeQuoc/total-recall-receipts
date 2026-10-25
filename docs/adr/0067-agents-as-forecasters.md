# ADR-0067: Agents as forecasters: owner delegations, agent-signed picks, MCP, and this repo's own sponsor

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Uy (goal U12, run by Uy's agent)

## Context
Goal U12 turns the three apps toward AI agents. The rule they share is decided in Remora's ADR-0066
("agents use Remora, Receipts and Kitty through MCP"):
- an agent acts only through MCP or the API, with a credential its owner made in the UI and can revoke;
- anything above an onchain limit goes back to the owner.

For Receipts the limit is the signature and the anchor before lock, and the product reason is simple.
An AI forecaster's track record is worth something only if it can't be edited after the game.
Receipts already makes that true for people (ADR-0064).

## Decision
- **Delegation.** The owner's wallet signs a personal message, `Receipts: let an agent pick for me`,
  with the group, the owner, the agent's address and name, an end date (at most 90 days) and the time.
  - The server rebuilds the text and checks the signature (5 minutes of skew, as in ADR-0064).
  - The agent becomes a member of its own, with `agentOf` set to the owner, so it's scored as its own
    voice, `agent:<address>`. Its label reads "Forecaster, agent for Owen".
  - A new delegation replaces the agent's live one.
  - **Revoking** is another signed message, `Receipts: stop an agent`. Both messages are kept.
- **Agent picks.**
  - The agent's own key signs the usual pick message, plus two lines: `agent for: <owner>` and
    `delegation: <id>`.
  - The server refuses the pick unless all of these hold: the delegation is in this group and for this
    agent, it isn't revoked, it hasn't ended, the signature is the agent's, and the event hasn't locked.
  - The pick's leaf is **v3**, `receipts/v3`, which adds the delegation id to v2's signer and signature.
    v1 and v2 leaves hash as before.
- **Verify.** An agent's receipt carries the owner's delegation, and its revocation if there is one.
  Verify checks, in order:
  - the leaf;
  - the agent's signature over a message that names this delegation;
  - the delegation: signed by the owner, for this group and this agent, unedited, and live at the pick's
    time;
  - the anchor.

  A stranger can check every revocation the receipt carries. A revocation the server hid can't be
  checked, and the anchor still proves when the pick was made.
- **MCP.** The JSON-RPC 2.0 is hand-written, without an SDK, after Remora's `packages/mcp`. One handler
  serves two transports:
  - **stdio** (`src/mcp/bin.ts`), run where the agent runs. It holds `RECEIPTS_AGENT_KEY` and signs each
    pick there; the key never crosses to Receipts. Tools: `list_markets`, `get_call` (with the memory
    blobs it cites), `submit_pick`, `get_receipt`, `leaderboard`.
  - **Streamable HTTP** at `/mcp`. It's read-only, behind a bearer token that the owner's wallet
    creates.
    - The token is shown once, stored as SHA-256, bound to one group and valid for 30 days.
    - It's revocable by another signature and rate-limited to 60 calls a minute.
    - `submit_pick` doesn't exist there.
    - GET is 405, since there's no server stream.
- **No custodial picks.** The remote server holds no agent key, so it can't pick. A pick signed by a key
  Receipts held would prove nothing about the agent. Cloud agents that should pick run the stdio server
  with their own key.
- **Third-party text stays data.** `list_markets` says that titles and labels come from ESPN,
  Polymarket and Kalshi, and the reference agent's prompt says so too.
- **Reference agent** (`agents/forecaster/run.ts`):
  - starts the stdio server with its own key;
  - reads the board and Receipts' call;
  - asks an OpenRouter model (`LLM_MODEL`, by default `google/gemini-2.5-flash`) for a side, a
    confidence and a one-line reason;
  - submits the pick.

  The reason is stored as the pick's note and shown as "Agent's reason".
- **Web.**
  - An Agents page: delegate (a signature), the live and past delegations with each agent's picks and
    record, revoke, the `claude mcp add` lines, and read-only tokens.
  - Agents are labelled on the board, the receipt, the leaderboard and Learning ("Agents next to the
    field").
- **This repo's own testnet sponsor.** On Oct 25 the goal gave this repo its own
  `SPONSOR_PRIVATE_KEY_TESTNET`:
  - address `0x81b0b7d04f733c0a6d4d3946012daa0cea4cf91e7975a38868f86454dd939e73`;
  - funded with 1 SUI from the spike owner, digest `3GBaACEpdtZ2iWiydfsGrAD786CKM3MXRN6HB2yuvJ3n`.

  Receipts' anchors then never compete with Remora's or Kitty's transactions for one gas coin. The
  value lives only in `.env`.

## Consequences
- An owner learns whether their agent deserves trust, from a record nobody can backdate. Receipts' own
  call weights the agent like any other voice once its picks resolve.
- **The owner is accountable for the agent:** the agent's picks are shown "for" them. An agent that
  misbehaves is revoked in one signature, and the picks it made before then stay valid.
- **Schema** (additive, nullable): `members.agent_of`, `picks.delegation_id`, and the `delegations` and
  `mcp_tokens` tables.
- **Not done:** zkLogin owners still need an Enoki key (ADR-0064), and the remote server has no
  OAuth.

## Links
- Remora's ADR-0066 (the cross-app rule), [ADR-0064](0064-receipts-kitty-web-with-wallets.md),
  [ADR-0065](0065-split-receipts-and-kitty-repos.md), [ADR-0066](0066-remora-design-system.md)
- [The exit record](../exit.md)
