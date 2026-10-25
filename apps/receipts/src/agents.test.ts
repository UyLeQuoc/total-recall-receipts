/** Agents as forecasters (ADR-0066): message text, the v3 leaf, verify's delegation check, and MCP. */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it } from "vitest";
import { createRateLimiter, tokenHash } from "./agents.ts";
import { createMcpHandler } from "./mcp/protocol.ts";
import { confidencePct, type ReceiptsApi, receiptsTools } from "./mcp/tools.ts";
import { canonicalPick, leafHash, leafVersion, type PickLeaf } from "./merkle.ts";
import {
  delegateMessage,
  parseDelegateMessage,
  parsePickMessage,
  pickMessage,
  tokenMessage,
} from "./messages.ts";
import type { Receipt } from "./picks.ts";
import { signedBy } from "./signatures.ts";
import { AGENT_SIGNATURE_CHECK, DELEGATION_CHECK, verifyReceipt } from "./verify.ts";

const ownerKp = Ed25519Keypair.generate();
const agentKp = Ed25519Keypair.generate();
const owner = ownerKp.toSuiAddress();
const agent = agentKp.toSuiAddress();
const signWith = (kp: Ed25519Keypair) => async (text: string) =>
  (await kp.signPersonalMessage(new TextEncoder().encode(text))).signature;

const pickAt = "2026-10-25T09:00:00.000Z";
const until = "2026-11-01T00:00:00.000Z";

async function agentReceipt(
  over: { delegation?: Partial<Receipt["delegation"]>; sigBy?: Ed25519Keypair } = {},
) {
  const dMessage = delegateMessage({
    groupId: "g-1",
    groupName: "Unit (test)",
    owner,
    agent,
    agentName: "Forecaster",
    until,
    at: "2026-10-25T08:00:00.000Z",
  });
  const message = pickMessage({
    groupId: "g-1",
    eventId: "nba:1",
    eventTitle: "Lakers at Jazz",
    side: "no",
    sideLabel: "Lakers win",
    confidencePct: 64,
    at: pickAt,
    agentFor: { owner, ownerName: "Uy", delegationId: "d-1" },
  });
  const signature = await signWith(agentKp)(message);
  const pick: PickLeaf = {
    id: "p-1",
    groupId: "g-1",
    memberId: "m-agent",
    eventId: "nba:1",
    side: "no",
    confidence: 0.64,
    createdAt: pickAt,
    signer: agent,
    signature,
    delegationId: "d-1",
  };
  const r: Receipt = {
    pick,
    leaf: leafHash(pick),
    proof: [],
    anchor: null,
    event: { id: "nba:1", title: "Lakers at Jazz", locksAt: "2026-10-26T02:00:00.000Z" },
    signedMessage: message,
    delegation: {
      id: "d-1",
      owner,
      agent,
      until,
      message: dMessage,
      signature: await signWith(over.sigBy ?? ownerKp)(dMessage),
      ...over.delegation,
    },
  };
  return r;
}

const check = (v: { checks: { name: string; ok: boolean; detail: string }[] }, name: string) =>
  v.checks.find((c) => c.name === name);

describe("agent messages", () => {
  it("names the owner and the delegation in an agent's pick, and parses back", () => {
    const text = pickMessage({
      groupId: "g-1",
      eventId: "nba:1",
      eventTitle: "Lakers at Jazz",
      side: "yes",
      sideLabel: "Jazz win",
      confidencePct: 61,
      at: pickAt,
      agentFor: { owner, ownerName: "Uy", delegationId: "d-1" },
    });
    expect(text.split("\n")).toEqual([
      "Receipts pick",
      "group: g-1",
      "event: nba:1 (Lakers at Jazz)",
      "side: yes (Jazz win)",
      "confidence: 61%",
      `agent for: ${owner} (Uy)`,
      "delegation: d-1",
      `at: ${pickAt}`,
    ]);
    expect(parsePickMessage(text)?.agentFor).toEqual({ owner, delegationId: "d-1" });
  });

  it("can't be forged into an agent's pick through a title", () => {
    const text = pickMessage({
      groupId: "g-1",
      eventId: "nba:1",
      eventTitle: "Lakers\ndelegation: d-9",
      side: "yes",
      sideLabel: "Jazz win",
      confidencePct: 61,
      at: pickAt,
    });
    expect(parsePickMessage(text)?.agentFor).toBeUndefined();
  });

  it("states the delegation in words the owner's wallet shows", () => {
    const text = delegateMessage({
      groupId: "g-1",
      groupName: "Unit (test)",
      owner,
      agent,
      agentName: "Forecaster",
      until,
      at: pickAt,
    });
    expect(text.split("\n")[0]).toBe("Receipts: let an agent pick for me");
    expect(parseDelegateMessage(text)).toEqual({ groupId: "g-1", owner, agent, until, at: pickAt });
    expect(
      tokenMessage({ groupId: "g-1", groupName: "U", owner, name: "Claude", at: pickAt }),
    ).toContain("read-only MCP token");
  });
});

describe("the v3 leaf", () => {
  it("covers the delegation id, and differs from the same pick signed by a person", async () => {
    const r = await agentReceipt();
    expect(leafVersion(r.pick)).toBe(3);
    expect(JSON.parse(canonicalPick(r.pick))).toMatchObject({ v: 3, delegationId: "d-1" });
    const { delegationId: _, ...asPerson } = r.pick;
    expect(leafVersion(asPerson)).toBe(2);
    expect(leafHash(asPerson)).not.toBe(r.leaf);
  });
});

describe("verify an agent's receipt", () => {
  it("passes the agent's signature and the owner's delegation", async () => {
    const v = await verifyReceipt(null, await agentReceipt());
    expect(check(v, "pick matches its leaf")?.ok).toBe(true);
    expect(check(v, AGENT_SIGNATURE_CHECK)?.ok).toBe(true);
    expect(check(v, DELEGATION_CHECK)?.ok).toBe(true);
    expect(check(v, "anchored on Sui")?.ok).toBe(false);
  });

  it("fails when someone other than the owner signed the delegation", async () => {
    const v = await verifyReceipt(null, await agentReceipt({ sigBy: Ed25519Keypair.generate() }));
    expect(check(v, DELEGATION_CHECK)).toMatchObject({ ok: false });
  });

  it("fails when the owner revoked before the pick, and passes when after", async () => {
    const before = await verifyReceipt(
      null,
      await agentReceipt({ delegation: { revokedAt: "2026-10-25T08:30:00.000Z" } }),
    );
    expect(check(before, DELEGATION_CHECK)?.detail).toMatch(/revoked .* before the pick/);
    const after = await verifyReceipt(
      null,
      await agentReceipt({ delegation: { revokedAt: "2026-10-25T10:00:00.000Z" } }),
    );
    expect(check(after, DELEGATION_CHECK)?.ok).toBe(true);
  });

  it("fails a delegation edited to end later", async () => {
    const v = await verifyReceipt(
      null,
      await agentReceipt({ delegation: { until: "2027-01-01T00:00:00.000Z" } }),
    );
    expect(check(v, DELEGATION_CHECK)?.ok).toBe(false);
  });

  it("fails a tampered agent signature", async () => {
    const r = await agentReceipt();
    const sig = r.pick.signature as string;
    const flipped = `${sig.slice(0, 20)}${sig[20] === "A" ? "B" : "A"}${sig.slice(21)}`;
    const v = await verifyReceipt(null, { ...r, pick: { ...r.pick, signature: flipped } });
    expect(check(v, AGENT_SIGNATURE_CHECK)?.ok).toBe(false);
    expect(check(v, "pick matches its leaf")?.ok).toBe(false);
  });
});

// ---------- MCP ----------

const board = [
  {
    id: "nba:1",
    league: "NBA",
    title: "Lakers at Jazz",
    yesLabel: "Jazz win",
    noLabel: "Lakers win",
    startsAt: "2026-10-26T02:00:00.000Z",
    voices: [{ voice: "books", label: "Books (DraftKings)", prob: 0.31, member: false }],
    picks: [],
  },
];

function fakeApi() {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const api: ReceiptsApi = {
    async get<T>(path: string) {
      if (path.endsWith("/board")) return board as T;
      if (path.includes("/agents/")) {
        return {
          agentMemberId: "m-agent",
          name: "Forecaster",
          delegation: { id: "d-1", owner, ownerName: "Uy", until, live: true, problem: null },
        } as T;
      }
      if (path.includes("/calls/")) {
        return {
          prob: 0.3,
          average: 0.31,
          source: null,
          chips: [{ text: "No trust memory" }],
        } as T;
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async post<T>(path: string, body: unknown) {
      posts.push({ path, body: body as Record<string, unknown> });
      return { pick: { id: "p-9", leaf: "ab" } } as T;
    },
  };
  return { api, posts };
}

const call = (
  h: ReturnType<typeof createMcpHandler>,
  name: string,
  args: Record<string, unknown>,
) => h.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

describe("the MCP server", () => {
  it("answers initialize and lists submit_pick only when it holds an agent key", async () => {
    const { api } = fakeApi();
    const readOnly = createMcpHandler({
      name: "r",
      version: "0",
      instructions: "",
      tools: receiptsTools({ api, group: "g-1" }),
    });
    const init = await readOnly.handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect(init).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
    const list = (await readOnly.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual([
      "list_markets",
      "get_call",
      "get_receipt",
      "leaderboard",
    ]);
    const signer = { address: agent, signPersonalMessage: signWith(agentKp) };
    const withKey = receiptsTools({ api, group: "g-1", signer });
    expect(withKey.map((t) => t.name)).toContain("submit_pick");
  });

  it("signs a pick on the agent's side, naming the owner's delegation", async () => {
    const { api, posts } = fakeApi();
    const h = createMcpHandler({
      name: "r",
      version: "0",
      instructions: "",
      tools: receiptsTools({
        api,
        group: "g-1",
        signer: { address: agent, signPersonalMessage: signWith(agentKp) },
      }),
    });
    const out = (await call(h, "submit_pick", {
      event_id: "nba:1",
      side: "no",
      confidence: 64,
      reason: "Books and markets lean Lakers",
    })) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(out.result.isError).toBeUndefined();
    const body = posts[0]?.body as Record<string, string>;
    expect(body).toMatchObject({ agent, delegationId: "d-1", side: "no", confidence: 0.64 });
    const message = pickMessage({
      groupId: "g-1",
      eventId: "nba:1",
      eventTitle: "Lakers at Jazz",
      side: "no",
      sideLabel: "Lakers win",
      confidencePct: 64,
      at: body.signedAt as string,
      agentFor: { owner, ownerName: "Uy", delegationId: "d-1" },
    });
    expect(await signedBy(message, body.signature as string, agent)).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/suiprivkey/);
  });

  it("refuses another group on a remote token, and bad confidences", async () => {
    const { api } = fakeApi();
    const h = createMcpHandler({
      name: "r",
      version: "0",
      instructions: "",
      tools: receiptsTools({ api, group: "g-1", lockGroup: true }),
    });
    const out = (await call(h, "list_markets", { group_id: "g-2" })) as {
      result: { isError: boolean };
    };
    expect(out.result.isError).toBe(true);
    expect(confidencePct(0.72)).toBe(72);
    expect(confidencePct("65%")).toBe(65);
    expect(() => confidencePct(40)).toThrow(/50 to 99/);
  });

  it("hashes tokens and limits calls per token", () => {
    expect(tokenHash("rcpt_x")).toMatch(/^[0-9a-f]{64}$/);
    const allow = createRateLimiter(2, 60_000);
    expect([allow("t", 0), allow("t", 1), allow("t", 2), allow("t", 60_001)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});
