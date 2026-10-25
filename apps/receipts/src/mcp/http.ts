/**
 * Receipts' remote MCP server (RC7, ADR-0066): Streamable HTTP at `/mcp`. Each POST carries one
 * JSON-RPC message (or a batch) and gets JSON back; there's no server-initiated stream, so GET is 405.
 *
 * It's read-only: the tools run in process against the API, with no agent key, and a bearer token the
 * group's owner created in the web binds them to that one group. Tokens are stored as SHA-256 and
 * rate-limited per token.
 */
import type { Hono } from "hono";
import { checkToken, createRateLimiter } from "../agents.ts";
import type { Db } from "../db/index.ts";
import { createMcpHandler, type Rpc, ToolError } from "./protocol.ts";
import { INSTRUCTIONS, type ReceiptsApi, receiptsTools } from "./tools.ts";

export function mountMcp(app: Hono, db: Db, opts: { perMinute?: number } = {}) {
  const allow = createRateLimiter(opts.perMinute ?? 60);
  /** The API, called in process: the same handlers the web uses. */
  const api: ReceiptsApi = {
    async get(path) {
      const res = await app.request(path);
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok)
        throw new ToolError(data.message ?? data.error ?? `Receipts answered ${res.status}`);
      return data as never;
    },
    async post() {
      throw new ToolError("The remote MCP server is read-only.");
    },
  };

  app.post("/mcp", async (c) => {
    const auth = c.req.header("authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
    if (!token) {
      c.header("WWW-Authenticate", 'Bearer realm="receipts"');
      return c.json({ error: "unauthorized", message: "Send the token as a bearer token." }, 401);
    }
    const used = await checkToken(db, token);
    if ("error" in used) return c.json({ error: "unauthorized", message: used.error }, 401);
    if (!allow(used.tokenId)) {
      return c.json({ error: "rate_limited", message: "Too many calls; wait a minute." }, 429);
    }
    const server = createMcpHandler({
      name: "receipts",
      version: "0.2.0",
      instructions: INSTRUCTIONS,
      tools: receiptsTools({ api, group: used.groupId, lockGroup: true }),
    });
    const body = (await c.req.json().catch(() => null)) as Rpc | Rpc[] | null;
    if (!body) {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400,
      );
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => server.handle(m)))).filter(Boolean);
      return out.length ? c.json(out) : c.body(null, 202);
    }
    const out = await server.handle(body);
    return out ? c.json(out) : c.body(null, 202);
  });
  app.get("/mcp", (c) => c.json({ error: "method_not_allowed" }, 405));
  app.delete("/mcp", (c) => c.json({ error: "method_not_allowed" }, 405));
}
