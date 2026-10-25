/**
 * Receipts as an MCP server (RC7, ADR-0066). The protocol is JSON-RPC 2.0, small enough to speak
 * directly, so there's no SDK, as in Remora's `packages/mcp` (copied pattern). One handler serves both
 * transports: stdio, one message per line (`stdio.ts`), and Streamable HTTP at `/mcp` (`http.ts`).
 */

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface Rpc {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

/** A refusal the agent should read, not a crash: it comes back as an `isError` tool result. */
export class ToolError extends Error {}

export function createMcpHandler(o: {
  name: string;
  version: string;
  instructions: string;
  tools: Tool[];
}) {
  const byName = new Map(o.tools.map((t) => [t.name, t]));

  /** One JSON-RPC message in, at most one out (notifications get no answer). */
  async function handle(msg: Rpc): Promise<Record<string, unknown> | null> {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
    const fail = (code: number, message: string) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      error: { code, message },
    });
    if (msg.id === undefined) return null;
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return reply({
          protocolVersion: (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
            ? asked
            : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: o.name, version: o.version },
          instructions: o.instructions,
        });
      }
      case "ping":
        return reply({});
      case "tools/list":
        return reply({
          tools: o.tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const tool = byName.get(name);
        if (!tool) return fail(-32602, `Unknown tool ${name}.`);
        try {
          const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {});
          return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
        } catch (err) {
          return reply({
            content: [{ type: "text", text: (err as Error).message }],
            isError: true,
          });
        }
      }
      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  }

  return { handle, tools: o.tools };
}
