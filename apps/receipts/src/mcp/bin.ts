#!/usr/bin/env bun
/**
 * `bun apps/receipts/src/mcp/bin.ts`: Receipts' MCP server on stdio (RC7, ADR-0066). In Claude Code:
 *   claude mcp add receipts -e RECEIPTS_API_URL=http://localhost:8811 -e RECEIPTS_GROUP=<group id> \
 *     -e RECEIPTS_AGENT_KEY=<the agent's suiprivkey> -- bun <repo>/apps/receipts/src/mcp/bin.ts
 * Without RECEIPTS_AGENT_KEY it's read-only (no submit_pick). The key never leaves this process.
 */
import { runStdio, signerFrom } from "./stdio.ts";

const signer = signerFrom(process.env.RECEIPTS_AGENT_KEY);
runStdio({
  apiUrl: process.env.RECEIPTS_API_URL ?? "http://localhost:8811",
  ...(process.env.RECEIPTS_GROUP ? { group: process.env.RECEIPTS_GROUP } : {}),
  ...(signer ? { signer } : {}),
});
