/**
 * Agents against the local dev database (ADR-0066): delegate, an agent's signed pick, its receipt,
 * revoke, and the read-only remote MCP server behind a token. Skips without Postgres, like db.test.ts.
 */
import { randomUUID } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Anchorer } from "./chain.ts";
import {
  anchors,
  createDb,
  delegations,
  events,
  groups,
  mcpTokens,
  members,
  picks,
} from "./db/index.ts";
import {
  delegateMessage,
  joinMessage,
  pickMessage,
  tokenMessage,
  undelegateMessage,
  untokenMessage,
} from "./messages.ts";
import { anchorPending } from "./picks.ts";
import { AGENT_SIGNATURE_CHECK, DELEGATION_CHECK } from "./verify.ts";

const url = process.env.DATABASE_URL ?? "postgres://receipts:receipts@localhost:5435/receipts";
const db = createDb(url);
let up = false;
const tag = randomUUID().slice(0, 8);
const groupId = `agents-${tag}`;
const otherGroup = `agents-other-${tag}`;
const open = `test:agent-open:${tag}`;
const second = `test:agent-second:${tag}`;
const anchorIds: string[] = [];

beforeAll(async () => {
  up = await Promise.race([
    db.execute("select 1 from receipts.delegations limit 1").then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
  ]).catch(() => false);
  if (!up) return;
  await db.insert(groups).values([
    { id: groupId, name: "Agents unit (test)" },
    { id: otherGroup, name: "Other unit (test)" },
  ]);
  const base = {
    league: "NBA",
    kind: "game",
    status: "scheduled",
    startsAt: new Date(Date.now() + 3_600_000),
  };
  await db.insert(events).values([
    {
      ...base,
      id: open,
      title: "Narwhals at Okapis",
      yesLabel: "Okapis win",
      noLabel: "Narwhals win",
    },
    {
      ...base,
      id: second,
      title: "Narwhals at Quokkas",
      yesLabel: "Quokkas win",
      noLabel: "Narwhals win",
    },
  ]);
});

afterAll(async () => {
  if (!up) return;
  const gs = [groupId, otherGroup];
  await db.delete(mcpTokens).where(inArray(mcpTokens.groupId, gs));
  await db.delete(picks).where(inArray(picks.groupId, gs));
  if (anchorIds.length) await db.delete(anchors).where(inArray(anchors.id, anchorIds));
  await db.delete(delegations).where(inArray(delegations.groupId, gs));
  await db.delete(members).where(inArray(members.groupId, gs));
  await db.delete(events).where(inArray(events.id, [open, second]));
  await db.delete(groups).where(inArray(groups.id, gs));
});

const fakeChain = (): Anchorer => {
  const roots: string[] = [];
  return {
    network: "testnet",
    packageId: "0x1",
    async anchor(root) {
      roots.push(root);
      return { digest: `digest-${tag}-${roots.length}`, tsMs: Date.now() };
    },
    async read(digest) {
      const root = roots[Number(digest.split("-").at(-1)) - 1];
      return root
        ? { digest, success: true, root, count: 1, tsMs: Date.now() - 1000, sender: "0x1" }
        : null;
    },
  };
};

describe("agents (ADR-0066)", () => {
  it("delegates, picks as an agent, verifies, revokes, and serves read-only MCP", async (ctx) => {
    if (!up) return ctx.skip();
    const chain = fakeChain();
    const app = createApp({ db, memory: null, anchorer: chain, webDist: "/nonexistent" });
    const ownerKp = Ed25519Keypair.generate();
    const agentKp = Ed25519Keypair.generate();
    const owner = ownerKp.toSuiAddress();
    const agent = agentKp.toSuiAddress();
    const sign = (kp: Ed25519Keypair) => async (text: string) =>
      (await kp.signPersonalMessage(new TextEncoder().encode(text))).signature;
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    const groupName = "Agents unit (test)";

    // The owner joins with a wallet.
    const at = new Date().toISOString();
    const join = { groupId, groupName, name: "Owen", address: owner, test: true, at };
    const joined = await post(`/api/groups/${groupId}/join`, {
      name: "Owen",
      address: owner,
      test: true,
      at,
      signature: await sign(ownerKp)(joinMessage(join)),
    });
    expect(joined.status).toBe(201);

    // A delegation signed by the wrong key is refused; the owner's is accepted.
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const d = { groupId, groupName, owner, agent, agentName: "Forecaster", until, at };
    const body = { owner, agent, agentName: "Forecaster", until, at };
    expect(
      (
        await post(`/api/groups/${groupId}/delegations`, {
          ...body,
          signature: await sign(agentKp)(delegateMessage(d)),
        })
      ).status,
    ).toBe(401);
    const made = await post(`/api/groups/${groupId}/delegations`, {
      ...body,
      signature: await sign(ownerKp)(delegateMessage(d)),
    });
    expect(made.status).toBe(201);
    const delegation = (await made.json()) as { id: string; agentMemberId: string };

    // The agent's MCP server reads its delegation, then signs a pick naming it.
    const info = (await (await app.request(`/api/groups/${groupId}/agents/${agent}`)).json()) as {
      delegation: { id: string; live: boolean; ownerName: string };
    };
    expect(info.delegation).toMatchObject({ id: delegation.id, live: true, ownerName: "Owen" });
    const agentPick = async (eventId: string, title: string) => {
      const signedAt = new Date().toISOString();
      const text = pickMessage({
        groupId,
        eventId,
        eventTitle: title,
        side: "no",
        sideLabel: "Narwhals win",
        confidencePct: 63,
        at: signedAt,
        agentFor: { owner, ownerName: "Owen", delegationId: delegation.id },
      });
      return post("/api/agent-picks", {
        groupId,
        eventId,
        side: "no",
        confidence: 0.63,
        agent,
        delegationId: delegation.id,
        signedAt,
        signature: await sign(agentKp)(text),
        note: "the books lean Narwhals",
      });
    };
    const picked = await agentPick(open, "Narwhals at Okapis");
    expect(picked.status).toBe(201);
    const { pick } = (await picked.json()) as { pick: { id: string } };

    // Anchored, the receipt passes the agent's signature, the delegation and the proof.
    const batch = await anchorPending({ db, anchorer: chain }, groupId);
    if (batch) anchorIds.push(batch.id);
    const page = (await (await app.request(`/api/picks/${pick.id}`)).json()) as {
      member: { label: string };
      owner: { name: string };
      reason: string;
    };
    expect(page.member.label).toBe("Forecaster, agent for Owen (test)");
    expect(page.reason).toBe("the books lean Narwhals");
    const v = (await (await app.request(`/api/picks/${pick.id}/verify`)).json()) as {
      ok: boolean;
      checks: { name: string; ok: boolean }[];
    };
    expect(v.checks.find((c) => c.name === AGENT_SIGNATURE_CHECK)?.ok).toBe(true);
    expect(v.checks.find((c) => c.name === DELEGATION_CHECK)?.ok).toBe(true);
    expect(v.ok).toBe(true);

    // The agent is scored as its own voice once the game resolves.
    await db.update(events).set({ status: "final", outcome: 0 }).where(eq(events.id, open));
    const scores = (await (await app.request(`/api/groups/${groupId}/scores`)).json()) as {
      league: string;
      voices: { voice: string; label: string }[];
    }[];
    const nba = scores.find((s) => s.league === "NBA");
    expect(nba?.voices.find((x) => x.voice === `agent:${agent}`)?.label).toBe(
      "Forecaster, agent for Owen (test)",
    );

    // The owner revokes; the agent's next pick is refused.
    const rat = new Date().toISOString();
    const revoked = await post(`/api/groups/${groupId}/delegations/${delegation.id}/revoke`, {
      at: rat,
      signature: await sign(ownerKp)(
        undelegateMessage({ groupId, groupName, owner, agent, agentName: "Forecaster", at: rat }),
      ),
    });
    expect(revoked.status).toBe(200);
    const refused = await agentPick(second, "Narwhals at Quokkas");
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { message: string }).message).toMatch(/revoked/);

    // A read-only token for the remote MCP server.
    const tat = new Date().toISOString();
    const created = await post(`/api/groups/${groupId}/mcp-tokens`, {
      owner,
      name: "Claude",
      at: tat,
      signature: await sign(ownerKp)(
        tokenMessage({ groupId, groupName, owner, name: "Claude", at: tat }),
      ),
    });
    expect(created.status).toBe(201);
    const { token, id: tokenId } = (await created.json()) as { token: string; id: string };
    const [stored] = await db.select().from(mcpTokens).where(eq(mcpTokens.id, tokenId));
    expect(stored?.sha256).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);

    const rpc = (msg: unknown, t: string | null = token) =>
      post("/mcp", msg, t ? { authorization: `Bearer ${t}` } : {});
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null)).status).toBe(401);
    const tools = (await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(tools.result.tools.map((t) => t.name)).not.toContain("submit_pick");
    const receipt = (await (
      await rpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_receipt", arguments: { pick_id: pick.id } },
      })
    ).json()) as { result: { content: { text: string }[] } };
    expect(JSON.parse(receipt.result.content[0]?.text ?? "{}")).toMatchObject({ verified: true });
    const other = (await (
      await rpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_markets", arguments: { group_id: otherGroup } },
      })
    ).json()) as { result: { isError: boolean } };
    expect(other.result.isError).toBe(true);

    const xat = new Date().toISOString();
    await post(`/api/groups/${groupId}/mcp-tokens/${tokenId}/revoke`, {
      at: xat,
      signature: await sign(ownerKp)(
        untokenMessage({ groupId, groupName, owner, tokenId, at: xat }),
      ),
    });
    expect((await rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" })).status).toBe(401);
  });
});
