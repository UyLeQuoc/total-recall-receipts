/**
 * Receipts' API (RC2–RC5, ADR-0061) and the built web (ADR-0064). JSON lives under `/api`; every
 * other path serves the React app, at the same paths the bot links to.
 */
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  AgentError,
  createToken,
  delegate,
  delegationProblem,
  latestDelegation,
  revokeToken,
  undelegate,
} from "./agents.ts";
import type { Anchorer } from "./chain.ts";
import { explorerTx } from "./chain.ts";
import {
  type Db,
  delegations,
  events,
  groups,
  mcpTokens,
  members,
  memories,
  picks,
  quotes,
} from "./db/index.ts";
import { openEvents } from "./ingest.ts";
import {
  agentVoice,
  forecastsOf,
  learn,
  marketProbs,
  memberVoice,
  type ReceiptsCall,
  receiptsCall,
} from "./learn.ts";
import { mountMcp } from "./mcp/http.ts";
import type { ReceiptsMemory } from "./memory.ts";
import { freshAt, joinMessage } from "./messages.ts";
import { anchorPending, logPick, PickError, type Receipt, receiptFor } from "./picks.ts";
import { calibration, statsByVoice, walkForward } from "./scoring.ts";
import { signedBy, suiAddress } from "./signatures.ts";
import { serveWeb } from "./static.ts";
import { verifyReceipt } from "./verify.ts";

export interface AppDeps {
  db: Db;
  memory: ReceiptsMemory | null;
  anchorer: Anchorer | null;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  now?: () => Date;
  /** Where the built web lives; the default is `web/dist`. */
  webDist?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  books: "Books (DraftKings)",
  polymarket: "Polymarket",
  kalshi: "Kalshi",
};

type MemberRow = typeof members.$inferSelect;

const testTag = (m: Pick<MemberRow, "test">) => (m.test ? " (test)" : "");

/** "Ava (test)", or for an agent "Forecaster, agent for Ava (test)" (ADR-0066). */
function memberLabel(m: Pick<MemberRow, "name" | "test" | "agentOf">, owner?: MemberRow) {
  if (m.agentOf) return `${m.name}, agent for ${owner?.name ?? "a member"}${testTag(m)}`;
  return `${m.name}${testTag(m)}`;
}

function memberView(m: MemberRow, all: MemberRow[] = []) {
  const owner = m.agentOf ? all.find((o) => o.id === m.agentOf) : undefined;
  return {
    id: m.id,
    name: m.name,
    label: memberLabel(m, owner),
    test: m.test,
    address: m.address,
    telegram: !!m.telegramUserId,
    agentOf: m.agentOf,
  };
}

async function labeller(db: Db, groupId: string) {
  const ms = await db.select().from(members).where(eq(members.groupId, groupId));
  const names = new Map<string, string>();
  for (const m of ms) {
    const label = memberView(m, ms).label;
    names.set(memberVoice(m.id), label);
    if (m.agentOf && m.address) names.set(agentVoice(m.address), label);
  }
  return (voice: string) => SOURCE_LABEL[voice] ?? names.get(voice) ?? voice;
}

const pickBody = z.object({
  groupId: z.string(),
  memberId: z.string(),
  eventId: z.string(),
  side: z.enum(["yes", "no"]),
  confidence: z.union([z.number(), z.string()]),
  note: z.string().optional(),
  signature: z.string().optional(),
  signedAt: z.string().optional(),
});

const joinBody = z.object({
  name: z.string().trim().min(1).max(60),
  address: z.string(),
  test: z.boolean().default(false),
  at: z.string(),
  signature: z.string(),
});

const agentPickBody = z.object({
  groupId: z.string(),
  eventId: z.string(),
  side: z.enum(["yes", "no"]),
  confidence: z.union([z.number(), z.string()]),
  agent: z.string(),
  delegationId: z.string(),
  signedAt: z.string(),
  signature: z.string(),
  note: z.string().max(200).optional(),
});

const delegateBody = z.object({
  owner: z.string(),
  agent: z.string(),
  agentName: z.string().trim().min(1).max(40),
  until: z.string(),
  at: z.string(),
  signature: z.string(),
});

const signedBody = z.object({ at: z.string(), signature: z.string() });

const pickStatus = (code: PickError["code"]) =>
  code === "not_found"
    ? 404
    : code === "signature_required" || code === "bad_signature"
      ? 401
      : code === "not_delegated"
        ? 403
        : 409;

const agentStatus = (code: AgentError["code"]): 400 | 401 | 403 | 404 | 409 =>
  (
    ({
      not_found: 404,
      bad_request: 400,
      bad_signature: 401,
      not_owner: 403,
      taken: 409,
      revoked: 409,
      expired: 409,
    }) as const
  )[code];

export function createApp(deps: AppDeps) {
  const { db } = deps;
  const app = new Hono();
  const now = () => deps.now?.() ?? new Date();

  const call = async (groupId: string, eventId: string): Promise<ReceiptsCall | null> => {
    if (!deps.memory) return null;
    return receiptsCall(
      { db, memory: deps.memory, labels: await labeller(db, groupId) },
      groupId,
      eventId,
    ).catch(() => null);
  };

  app.get("/health", (c) => c.json({ ok: true }));

  // ---------- groups and members ----------

  app.get("/api/groups", async (c) => {
    const gs = await db.select().from(groups).orderBy(desc(groups.createdAt)).limit(30);
    const counts = gs.length
      ? await db
          .select({ groupId: members.groupId, n: count() })
          .from(members)
          .where(
            inArray(
              members.groupId,
              gs.map((g) => g.id),
            ),
          )
          .groupBy(members.groupId)
      : [];
    return c.json(
      gs.map((g) => ({
        id: g.id,
        name: g.name,
        telegram: !!g.telegramChatId,
        createdAt: g.createdAt.toISOString(),
        members: counts.find((x) => x.groupId === g.id)?.n ?? 0,
      })),
    );
  });

  app.post("/api/groups", async (c) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await c.req.json());
    const id = randomUUID();
    await db.insert(groups).values({ id, name });
    return c.json({ id, name }, 201);
  });

  app.get("/api/groups/:id", async (c) => {
    const [g] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, c.req.param("id")));
    if (!g) return c.json({ error: "not_found" }, 404);
    const ms = await db.select().from(members).where(eq(members.groupId, g.id));
    return c.json({
      id: g.id,
      name: g.name,
      telegram: !!g.telegramChatId,
      createdAt: g.createdAt.toISOString(),
      members: ms.map((m) => memberView(m, ms)),
    });
  });

  /** A member without a wallet (scripts, tests). Their picks are unsigned and labelled so. */
  app.post("/api/groups/:id/members", async (c) => {
    const body = z
      .object({ name: z.string().min(1).max(60), test: z.boolean().default(false) })
      .parse(await c.req.json());
    const id = randomUUID();
    await db
      .insert(members)
      .values({ id, groupId: c.req.param("id"), name: body.name, test: body.test });
    return c.json({ id, ...body }, 201);
  });

  /** Joining with a wallet (ADR-0064): the wallet signs `joinMessage`, and its picks must be signed. */
  app.post("/api/groups/:id/join", async (c) => {
    const parsed = joinBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const body = parsed.data;
    const [g] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, c.req.param("id")));
    if (!g) return c.json({ error: "not_found" }, 404);
    const address = suiAddress(body.address);
    if (!address) return c.json({ error: "bad_address", message: "Not a Sui address." }, 400);
    if (!freshAt(body.at, now())) {
      return c.json(
        { error: "bad_signature", message: "The signed time is more than 5 minutes off." },
        401,
      );
    }
    const message = joinMessage({
      groupId: g.id,
      groupName: g.name,
      name: body.name,
      address: body.address,
      test: body.test,
      at: body.at,
    });
    if (!(await signedBy(message, body.signature, address))) {
      return c.json(
        { error: "bad_signature", message: "The signature doesn't match this wallet." },
        401,
      );
    }
    const [existing] = await db
      .select()
      .from(members)
      .where(and(eq(members.groupId, g.id), eq(members.address, address)));
    if (existing?.agentOf) {
      return c.json({ error: "taken", message: "This address is an agent in this group." }, 409);
    }
    if (existing) return c.json(memberView(existing));
    const [m] = await db
      .insert(members)
      .values({ id: randomUUID(), groupId: g.id, name: body.name, test: body.test, address })
      .returning();
    deps.log?.("member.joined", { group: g.id, address });
    return c.json(memberView(m as MemberRow), 201);
  });

  // ---------- markets ----------

  app.get("/api/groups/:id/events", async (c) => {
    const open = await openEvents(db, now());
    const qs = open.length
      ? await db
          .select()
          .from(quotes)
          .where(
            inArray(
              quotes.eventId,
              open.map((e) => e.id),
            ),
          )
      : [];
    return c.json(
      open.map((e) => ({
        ...e,
        quotes: Object.fromEntries(
          qs.filter((q) => q.eventId === e.id).map((q) => [q.voice, q.prob]),
        ),
      })),
    );
  });

  /** The board: each open market with every voice's number and the group's picks. */
  app.get("/api/groups/:id/board", async (c) => {
    const groupId = c.req.param("id");
    const open = (await openEvents(db, now())).slice(0, 24);
    const ids = open.map((e) => e.id);
    const markets = await marketProbs(db, groupId, ids);
    const label = await labeller(db, groupId);
    const ps = ids.length
      ? await db
          .select()
          .from(picks)
          .where(and(eq(picks.groupId, groupId), inArray(picks.eventId, ids)))
      : [];
    return c.json(
      open.map((e) => {
        const m = markets.find((x) => x.eventId === e.id);
        return {
          id: e.id,
          league: e.league,
          kind: e.kind,
          title: e.title,
          yesLabel: e.yesLabel,
          noLabel: e.noLabel,
          startsAt: e.startsAt.toISOString(),
          voices: Object.entries(m?.probs ?? {}).map(([voice, prob]) => ({
            voice,
            label: label(voice),
            prob,
            member: voice.startsWith("member:") || voice.startsWith("agent:"),
            agent: voice.startsWith("agent:"),
          })),
          picks: ps
            .filter((p) => p.eventId === e.id)
            .map((p) => ({
              id: p.id,
              memberId: p.memberId,
              side: p.side,
              confidence: p.confidence,
              signed: !!p.signature,
              agent: !!p.delegationId,
            })),
        };
      }),
    );
  });

  app.get("/api/groups/:id/calls/:eventId", async (c) => {
    const r = await call(c.req.param("id"), c.req.param("eventId"));
    return r ? c.json(r) : c.json({ error: "unavailable" }, 503);
  });

  // ---------- picks and receipts ----------

  app.post("/api/picks", async (c) => {
    const body = pickBody.parse(await c.req.json());
    try {
      const r = await logPick(
        {
          db,
          memory: deps.memory,
          anchorer: deps.anchorer,
          ...(deps.log ? { log: deps.log } : {}),
        },
        { ...body, now: now() },
      );
      return c.json({ pick: r.pick, nudge: r.nudge }, 201);
    } catch (err) {
      if (err instanceof PickError)
        return c.json({ error: err.code, message: err.message }, pickStatus(err.code));
      throw err;
    }
  });

  app.get("/api/groups/:id/picks", async (c) => {
    const groupId = c.req.param("id");
    const label = await labeller(db, groupId);
    const rows = await db
      .select({ p: picks, e: events })
      .from(picks)
      .innerJoin(events, eq(picks.eventId, events.id))
      .where(eq(picks.groupId, groupId))
      .orderBy(desc(picks.createdAt))
      .limit(30);
    return c.json(
      rows.map(({ p, e }) => ({
        id: p.id,
        eventId: e.id,
        title: e.title,
        league: e.league,
        memberId: p.memberId,
        member: label(memberVoice(p.memberId)),
        side: p.side,
        sideLabel: p.side === "yes" ? e.yesLabel : e.noLabel,
        confidence: p.confidence,
        createdAt: p.createdAt.toISOString(),
        anchored: !!p.anchorId,
        signed: !!p.signature,
        agent: !!p.delegationId,
        reason: p.delegationId ? p.note : null,
        result: e.outcome === null ? null : (e.outcome === 1) === (p.side === "yes"),
      })),
    );
  });

  /** An agent's pick (ADR-0066): its own key signed the message naming the owner's delegation. */
  app.post("/api/agent-picks", async (c) => {
    const parsed = agentPickBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const body = parsed.data;
    const address = suiAddress(body.agent);
    const [agent] = address
      ? await db
          .select()
          .from(members)
          .where(
            and(
              eq(members.groupId, body.groupId),
              eq(members.address, address),
              isNotNull(members.agentOf),
            ),
          )
      : [];
    if (!agent) {
      return c.json(
        { error: "not_delegated", message: "No owner in this group has delegated this agent." },
        403,
      );
    }
    try {
      const r = await logPick(
        {
          db,
          memory: deps.memory,
          anchorer: deps.anchorer,
          ...(deps.log ? { log: deps.log } : {}),
        },
        {
          groupId: body.groupId,
          memberId: agent.id,
          eventId: body.eventId,
          side: body.side,
          confidence: body.confidence,
          signature: body.signature,
          signedAt: body.signedAt,
          delegationId: body.delegationId,
          ...(body.note ? { note: body.note } : {}),
          now: now(),
        },
      );
      deps.log?.("agent.picked", { group: body.groupId, agent: address, pick: r.pick.id });
      return c.json({ pick: r.pick }, 201);
    } catch (err) {
      if (err instanceof PickError)
        return c.json({ error: err.code, message: err.message }, pickStatus(err.code));
      throw err;
    }
  });

  // ---------- agents: delegations and read-only MCP tokens (ADR-0066) ----------

  const param = (c: Context, name: string) => c.req.param(name) ?? "";
  /** An agent route: an `AgentError` becomes its status and message. */
  const agentRoute =
    (f: (c: Context) => Promise<Response>) =>
    async (c: Context): Promise<Response> => {
      try {
        return await f(c);
      } catch (err) {
        if (err instanceof AgentError) {
          return c.json({ error: err.code, message: err.message }, agentStatus(err.code));
        }
        throw err;
      }
    };

  app.get("/api/groups/:id/delegations", async (c) => {
    const groupId = c.req.param("id");
    const ds = await db
      .select()
      .from(delegations)
      .where(eq(delegations.groupId, groupId))
      .orderBy(desc(delegations.createdAt));
    const ms = await db.select().from(members).where(eq(members.groupId, groupId));
    const counts = await db
      .select({ memberId: picks.memberId, n: count() })
      .from(picks)
      .where(and(eq(picks.groupId, groupId), isNotNull(picks.delegationId)))
      .groupBy(picks.memberId);
    const s = await scores(db, groupId);
    const t = now();
    return c.json(
      ds.map((d) => {
        const owner = ms.find((m) => m.id === d.ownerMemberId);
        const voice = agentVoice(d.agent);
        return {
          id: d.id,
          agent: d.agent,
          agentName: d.agentName,
          agentMemberId: d.agentMemberId,
          owner: d.owner,
          ownerName: owner ? memberLabel(owner) : "",
          until: d.until.toISOString(),
          createdAt: d.createdAt.toISOString(),
          revokedAt: d.revokedAt?.toISOString() ?? null,
          live: !delegationProblem(d, t),
          message: d.message,
          picks: counts.find((x) => x.memberId === d.agentMemberId)?.n ?? 0,
          record: s.flatMap((lg) =>
            lg.voices
              .filter((v) => v.voice === voice)
              .map((v) => ({
                league: lg.league,
                n: v.n,
                hits: v.hits,
                brier: v.brier,
                shrunk: v.shrunk,
              })),
          ),
        };
      }),
    );
  });

  app.post(
    "/api/groups/:id/delegations",
    agentRoute(async (c) => {
      const parsed = delegateBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "bad_request" }, 400);
      const r = await delegate(db, { groupId: param(c, "id"), ...parsed.data }, now());
      deps.log?.("agent.delegated", { group: r.delegation.groupId, agent: r.delegation.agent });
      return c.json(
        {
          id: r.delegation.id,
          agent: r.delegation.agent,
          agentMemberId: r.agentMember.id,
          until: r.delegation.until.toISOString(),
        },
        201,
      );
    }),
  );

  app.post(
    "/api/groups/:id/delegations/:did/revoke",
    agentRoute(async (c) => {
      const parsed = signedBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "bad_request" }, 400);
      const d = await undelegate(
        db,
        { groupId: param(c, "id"), delegationId: param(c, "did"), ...parsed.data },
        now(),
      );
      deps.log?.("agent.revoked", { group: d.groupId, agent: d.agent });
      return c.json({ id: d.id, revokedAt: d.revokedAt?.toISOString() });
    }),
  );

  /** What an agent's MCP server needs to sign a pick: its newest delegation, live or not. */
  app.get("/api/groups/:id/agents/:address", async (c) => {
    const found = await latestDelegation(db, c.req.param("id"), c.req.param("address"));
    if (!found)
      return c.json({ error: "not_found", message: "This agent has no delegation here." }, 404);
    const { delegation: d, owner } = found;
    const problem = delegationProblem(d, now());
    return c.json({
      agentMemberId: d.agentMemberId,
      name: d.agentName,
      delegation: {
        id: d.id,
        owner: d.owner,
        ownerName: owner?.name ?? "",
        until: d.until.toISOString(),
        live: !problem,
        problem,
      },
    });
  });

  app.get("/api/groups/:id/mcp-tokens", async (c) => {
    const rows = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.groupId, c.req.param("id")))
      .orderBy(desc(mcpTokens.createdAt));
    return c.json(
      rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
        revokedAt: t.revokedAt?.toISOString() ?? null,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        calls: t.calls,
      })),
    );
  });

  app.post(
    "/api/groups/:id/mcp-tokens",
    agentRoute(async (c) => {
      const parsed = z
        .object({
          owner: z.string(),
          name: z.string().trim().min(1).max(40),
          at: z.string(),
          signature: z.string(),
        })
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "bad_request" }, 400);
      const { token, row } = await createToken(
        db,
        { groupId: param(c, "id"), ...parsed.data },
        now(),
      );
      deps.log?.("mcp.token_created", { group: row.groupId, token: row.id });
      // The token itself is in this response and nowhere else.
      return c.json(
        { id: row.id, name: row.name, token, expiresAt: row.expiresAt.toISOString() },
        201,
      );
    }),
  );

  app.post(
    "/api/groups/:id/mcp-tokens/:tid/revoke",
    agentRoute(async (c) => {
      const parsed = signedBody.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "bad_request" }, 400);
      await revokeToken(
        db,
        { groupId: param(c, "id"), tokenId: param(c, "tid"), ...parsed.data },
        now(),
      );
      return c.json({ id: param(c, "tid"), revoked: true });
    }),
  );

  /** Anchors now. `?group=` limits the batch to one group's picks. */
  app.post("/api/anchor", async (c) =>
    c.json(
      (await anchorPending(
        {
          db,
          anchorer: deps.anchorer,
          ...(deps.log ? { log: deps.log } : {}),
        },
        c.req.query("group") || undefined,
      )) ?? { anchored: 0 },
    ),
  );

  /** The portable receipt: what a stranger needs to check the pick. */
  app.get("/api/receipts/:pickId", async (c) => {
    const r = await receiptFor(db, c.req.param("pickId"));
    return r ? c.json(r) : c.json({ error: "not_found" }, 404);
  });

  /** The receipt plus what the page shows around it. */
  app.get("/api/picks/:pickId", async (c) => {
    const r = await receiptFor(db, c.req.param("pickId"));
    if (!r) return c.json({ error: "not_found" }, 404);
    const [e] = await db.select().from(events).where(eq(events.id, r.event.id));
    const [m] = await db.select().from(members).where(eq(members.id, r.pick.memberId));
    const [g] = await db.select().from(groups).where(eq(groups.id, r.pick.groupId));
    const [owner] = m?.agentOf
      ? await db.select().from(members).where(eq(members.id, m.agentOf))
      : [];
    const [row] = await db.select({ note: picks.note }).from(picks).where(eq(picks.id, r.pick.id));
    return c.json({
      receipt: r,
      group: g ? { id: g.id, name: g.name } : null,
      member: m ? memberView(m, owner ? [owner] : []) : null,
      owner: owner ? memberView(owner) : null,
      reason: r.pick.delegationId ? (row?.note ?? null) : null,
      event: e
        ? {
            id: e.id,
            league: e.league,
            title: e.title,
            yesLabel: e.yesLabel,
            noLabel: e.noLabel,
            startsAt: e.startsAt.toISOString(),
            status: e.status,
            outcome: e.outcome,
            detail: e.detail,
          }
        : null,
      sideLabel: e ? (r.pick.side === "yes" ? e.yesLabel : e.noLabel) : r.pick.side,
      explorer: r.anchor ? explorerTx(r.anchor.digest) : null,
    });
  });

  app.get("/api/picks/:pickId/verify", async (c) => {
    const r = await receiptFor(db, c.req.param("pickId"));
    if (!r) return c.json({ error: "not_found" }, 404);
    return c.json(await verifyReceipt(deps.anchorer, r));
  });

  /** Verifies any receipt JSON, ours or edited: nothing is read from the database. */
  app.post("/api/verify", async (c) =>
    c.json(await verifyReceipt(deps.anchorer, (await c.req.json()) as Receipt)),
  );

  // ---------- learning ----------

  app.post("/api/groups/:id/learn", async (c) => {
    if (!deps.memory) return c.json({ error: "no memory" }, 503);
    return c.json(await learn({ db, memory: deps.memory }, c.req.param("id"), now()));
  });

  app.get("/api/groups/:id/scores", async (c) => {
    const groupId = c.req.param("id");
    const label = await labeller(db, groupId);
    const s = await scores(db, groupId);
    return c.json(
      s.map((lg) => ({ ...lg, voices: lg.voices.map((v) => ({ ...v, label: label(v.voice) })) })),
    );
  });

  app.get("/api/groups/:id/learning", async (c) => c.json(await learning(db, c.req.param("id"))));

  app.get("/api/groups/:id/memories", async (c) =>
    c.json(await groupMemories(db, c.req.param("id"))),
  );

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  mountMcp(app, db);
  serveWeb(app, deps.webDist);
  return app;
}

export async function scores(db: Db, groupId: string) {
  const forecasts = forecastsOf(await marketProbs(db, groupId));
  const stats = statsByVoice(forecasts);
  const leagues = [...new Set(stats.map((s) => s.league))].sort();
  return leagues.map((league) => ({
    league,
    voices: stats.filter((s) => s.league === league).sort((a, b) => a.shrunk - b.shrunk),
    calibration: calibration(forecasts.filter((f) => f.league === league)),
  }));
}

export async function learning(db: Db, groupId: string) {
  const markets = (await marketProbs(db, groupId)).filter((m) => m.outcome !== null);
  const evs = markets.length
    ? await db
        .select({ id: events.id, backfill: events.backfill })
        .from(events)
        .where(
          inArray(
            events.id,
            markets.map((m) => m.eventId),
          ),
        )
    : [];
  const back = new Set(evs.filter((e) => e.backfill).map((e) => e.id));
  const leagues = [...new Set(markets.map((m) => m.league))].sort();
  return leagues.map((league) => {
    const ms = markets.filter((m) => m.league === league);
    return {
      league,
      backfilled: ms.filter((m) => back.has(m.eventId)).length,
      curve: walkForward(ms.map((m) => ({ ...m, outcome: m.outcome as 0 | 1 }))),
    };
  });
}

export async function groupMemories(db: Db, groupId: string) {
  const ms = await db.select({ id: members.id }).from(members).where(eq(members.groupId, groupId));
  const rows = await db
    .select()
    .from(memories)
    .where(like(memories.namespace, `receipts:%`))
    .orderBy(desc(memories.createdAt))
    .limit(200);
  const mine = new Set(ms.map((m) => `receipts:member:${m.id}:insights`));
  return rows.filter(
    (r) => r.namespace.startsWith(`receipts:group:${groupId}:`) || mine.has(r.namespace),
  );
}
