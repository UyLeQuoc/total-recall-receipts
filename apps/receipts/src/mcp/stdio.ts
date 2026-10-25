/**
 * Receipts' MCP server on stdio (RC7, ADR-0066): newline-delimited JSON-RPC in and out. It runs where
 * the agent runs, with the agent's key (`RECEIPTS_AGENT_KEY`) in its own environment, and reaches
 * Receipts over HTTP. The key signs pick messages here and is never sent anywhere.
 */
import type { Readable, Writable } from "node:stream";
import { keypairFrom } from "../keys.ts";
import { createMcpHandler, type Rpc, ToolError } from "./protocol.ts";
import { type AgentSigner, INSTRUCTIONS, type ReceiptsApi, receiptsTools } from "./tools.ts";

/** Receipts' HTTP API, with its error messages passed to the agent as tool errors. */
export function httpApi(baseUrl: string, fetcher: typeof fetch = fetch): ReceiptsApi {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetcher(new URL(path, baseUrl), init);
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok)
      throw new ToolError(data.message ?? data.error ?? `Receipts answered ${res.status}`);
    return data as T;
  };
  return {
    get: (path) => call(path),
    post: (path, body) =>
      call(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

export function signerFrom(raw: string | undefined): AgentSigner | undefined {
  if (!raw) return undefined;
  const kp = keypairFrom(raw, "RECEIPTS_AGENT_KEY");
  return {
    address: kp.toSuiAddress(),
    signPersonalMessage: async (text) =>
      (await kp.signPersonalMessage(new TextEncoder().encode(text))).signature,
  };
}

export function runStdio(
  o: { apiUrl: string; group?: string; signer?: AgentSigner; fetcher?: typeof fetch },
  input: Readable = process.stdin,
  output: Writable = process.stdout,
) {
  const server = createMcpHandler({
    name: "receipts",
    version: "0.2.0",
    instructions: INSTRUCTIONS,
    tools: receiptsTools({
      api: httpApi(o.apiUrl, o.fetcher),
      ...(o.signer ? { signer: o.signer } : {}),
      ...(o.group ? { group: o.group } : {}),
    }),
  });
  let buffer = "";
  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
      if (!line) continue;
      let msg: Rpc;
      try {
        msg = JSON.parse(line) as Rpc;
      } catch {
        output.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
        );
        continue;
      }
      void server.handle(msg).then((out) => {
        if (out) output.write(`${JSON.stringify(out)}\n`);
      });
    }
  });
  return server;
}
