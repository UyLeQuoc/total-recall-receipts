// The Receipts exit (U11, ADR-0061), against a running server (RECEIPTS_WORKER=on) on testnet.
//   bun --env-file=../../.env scripts/exit.ts before   # before tonight's NBA games lock
//   bun --env-file=../../.env scripts/exit.ts after    # once some of them are final
// Test members are labelled "(test)". Results go to test-results/receipts-exit-<stage>.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { RelayerExtras } from "@total-recall/memory";
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { createDb, events, memories, picks } from "../src/db/index.ts";
import { readEnv } from "../src/env.ts";
import { ns } from "../src/memory.ts";

const env = readEnv();
const db = createDb(env.DATABASE_URL);
const BASE = env.RECEIPTS_BASE_URL;
const stage = process.argv[2] ?? "before";
const out: Record<string, unknown> = { stage, startedAt: new Date().toISOString() };
const STATE = "test-results/receipts-exit-state.json";
mkdirSync("test-results", { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function check(name: string, ok: boolean, detail: unknown = "") {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}`,
    typeof detail === "string" ? detail : JSON.stringify(detail),
  );
  (out.checks as unknown[]).push({ name, ok, detail });
  if (!ok) process.exitCode = 1;
}
out.checks = [];

async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; form?: Record<string, string> },
) {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    redirect: "manual",
    headers: init?.form
      ? { "content-type": "application/x-www-form-urlencoded" }
      : { "content-type": "application/json" },
    ...(init?.form
      ? { body: new URLSearchParams(init.form).toString() }
      : init?.body
        ? { body: JSON.stringify(init.body) }
        : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json: json as T, text, location: res.headers.get("location") };
}

async function until<T>(
  what: string,
  fn: () => Promise<T | null | undefined | false>,
  ms = 300_000,
  every = 15_000,
) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

interface Call {
  prob: number | null;
  source: { blobId: string; asOf: string } | null;
  chips: { text: string; blobId?: string }[];
}

if (stage === "before") {
  const t0 = Date.now();
  const group = (
    await api<{ id: string }>("/api/groups", {
      body: { name: `U11 exit ${new Date().toISOString().slice(0, 16)} (test)` },
    })
  ).json;
  const ava = (
    await api<{ id: string }>(`/api/groups/${group.id}/members`, {
      body: { name: "Ava", test: true },
    })
  ).json;
  const ollie = (
    await api<{ id: string }>(`/api/groups/${group.id}/members`, {
      body: { name: "Ollie", test: true },
    })
  ).json;
  out.group = group.id;
  out.members = { ava: ava.id, ollie: ollie.id };

  const open = (
    await api<
      {
        id: string;
        league: string;
        title: string;
        startsAt: string;
        quotes: Record<string, number>;
      }[]
    >(`/api/groups/${group.id}/events`)
  ).json;
  const tonight = open.filter(
    (e) =>
      e.league === "NBA" &&
      Date.parse(e.startsAt) - Date.now() < 18 * 3600_000 &&
      Date.parse(e.startsAt) > Date.now() + 5 * 60_000 &&
      e.quotes.books !== undefined,
  );
  check(
    "open NBA games with a book line",
    tonight.length >= 5,
    tonight.map((e) => e.title),
  );

  // Ava backs the books' favourite at the books' confidence; Ollie backs the underdog at 90%.
  const pickIds: string[] = [];
  for (const [i, e] of tonight.entries()) {
    const fav = (e.quotes.books as number) >= 0.5 ? "yes" : "no";
    const conf = Math.min(
      0.9,
      Math.max(0.55, Math.max(e.quotes.books as number, 1 - (e.quotes.books as number))),
    );
    const a =
      i === 0
        ? await api(`/g/${group.id}/pick`, {
            form: {
              memberId: ava.id,
              eventId: e.id,
              side: fav,
              confidence: String(Math.round(conf * 100)),
            },
          })
        : await api<{ pick: { id: string } }>("/api/picks", {
            body: {
              groupId: group.id,
              memberId: ava.id,
              eventId: e.id,
              side: fav,
              confidence: Math.round(conf * 100) / 100,
            },
          });
    if (i === 0) {
      check(
        "a pick through the web form redirects to its receipt",
        a.status === 302 && !!a.location?.startsWith("/p/"),
        a.location,
      );
      if (a.location) pickIds.push(a.location.split("/p/")[1]?.split("?")[0] as string);
    } else {
      pickIds.push((a.json as { pick: { id: string } }).pick.id);
    }
    const o = await api<{ pick: { id: string } }>("/api/picks", {
      body: {
        groupId: group.id,
        memberId: ollie.id,
        eventId: e.id,
        side: fav === "yes" ? "no" : "yes",
        confidence: 0.9,
      },
    });
    check(`Ollie's pick on ${e.title}`, o.status === 201, o.status);
    if (o.status === 201) pickIds.push(o.json.pick.id);
  }
  out.picks = pickIds.length;

  // 1. A pick on a locked event is refused.
  const [locked] = await db
    .select()
    .from(events)
    .where(and(eq(events.league, "NBA"), isNotNull(events.outcome)))
    .limit(1);
  const late = await api<{ error: string; message: string }>("/api/picks", {
    body: {
      groupId: group.id,
      memberId: ava.id,
      eventId: locked?.id,
      side: "yes",
      confidence: 0.7,
    },
  });
  check(
    "a pick on a locked event is refused",
    late.status === 409 && late.json.error === "locked",
    late.json,
  );

  // 2. The anchor lands; verify passes for a pick and fails for a tampered one.
  const a = await api<{ digest?: string; count?: number; root?: string }>("/api/anchor", {
    body: {},
  });
  check("the anchor transaction lands on testnet", !!a.json.digest, a.json);
  out.anchor = a.json;
  const receipt = (await api<Record<string, unknown>>(`/api/receipts/${pickIds[1]}`)).json as {
    pick: { confidence: number };
  };
  const v = await api<{ ok: boolean; checks: { name: string; ok: boolean }[] }>("/api/verify", {
    body: receipt,
  });
  check("verify passes for a real receipt", v.json.ok, v.json.checks);
  const tampered = { ...receipt, pick: { ...receipt.pick, confidence: 0.99 } };
  const vt = await api<{ ok: boolean; checks: { name: string; ok: boolean }[] }>("/api/verify", {
    body: tampered,
  });
  check(
    "verify fails for a tampered receipt",
    !vt.json.ok,
    vt.json.checks.filter((c) => !c.ok).map((c) => c.name),
  );

  // 3. Receipts' call before and after the trust snapshot: it changes and cites the memory.
  const target = tonight.at(-1) as { id: string };
  const before = (await api<Call>(`/api/groups/${group.id}/calls/${target.id}`)).json;
  check(
    "before learning, the call says it has no trust memory",
    before.source === null,
    before.chips.map((c) => c.text),
  );
  const wrote = (
    await api<{ trust: string[]; radar: string[] }>(`/api/groups/${group.id}/learn`, { body: {} })
  ).json;
  check("learning writes trust snapshots", wrote.trust.length > 0, wrote);
  const stored = await until(
    "the trust snapshot's blob",
    async () => {
      const rows = await db
        .select()
        .from(memories)
        .where(and(eq(memories.namespace, ns.trust(group.id)), eq(memories.status, "stored")));
      return rows.length >= wrote.trust.length ? rows : null;
    },
    240_000,
    10_000,
  );
  out.trustBlobs = stored.map((r) => r.blobId);
  const after = await until(
    "a call weighted by the recalled snapshot",
    async () => {
      const c = (await api<Call>(`/api/groups/${group.id}/calls/${target.id}`)).json;
      return c.source ? c : null;
    },
    300_000,
    20_000,
  );
  check(
    "after learning, the call cites a stored trust snapshot",
    !!after.source && stored.some((r) => r.blobId === after.source?.blobId),
    after.source,
  );
  check("the call changed", before.prob !== after.prob, { before: before.prob, after: after.prob });
  out.call = { event: target.id, before, after };

  // 5. The learning curve.
  const learning = (
    await api<{ league: string; backfilled: number; curve: unknown[] }[]>(
      `/api/groups/${group.id}/learning`,
    )
  ).json;
  const nba = learning.find((l) => l.league === "NBA");
  check("the Learning curve shows NBA games", (nba?.curve.length ?? 0) >= 20, {
    n: nba?.curve.length,
    backfilled: nba?.backfilled,
  });
  const page = await api(`/g/${group.id}/learning`);
  check(
    "the Learning page renders its chart",
    page.status === 200 && page.text.includes("<svg"),
    page.status,
  );

  writeFileSync(
    STATE,
    JSON.stringify(
      { group: group.id, ava: ava.id, ollie: ollie.id, tonight: tonight.map((e) => e.id) },
      null,
      2,
    ),
  );
  out.seconds = Math.round((Date.now() - t0) / 1000);
} else {
  const state = JSON.parse(readFileSync(STATE, "utf8")) as {
    group: string;
    ava: string;
    ollie: string;
    tonight: string[];
  };
  out.group = state.group;
  const done = await db
    .select()
    .from(events)
    .where(and(inArray(events.id, state.tonight), isNotNull(events.outcome)));
  check(
    "tonight's games resolved",
    done.length >= 5,
    done.map((e) => `${e.title}: ${e.detail}`),
  );
  const learned = (
    await api<{ trust: string[]; insights: string[] }>(`/api/groups/${state.group}/learn`, {
      body: {},
    })
  ).json;
  out.learned = learned;
  const scores = (
    await api<
      { league: string; voices: { voice: string; n: number; hits: number; brier: number }[] }[]
    >(`/api/groups/${state.group}/scores`)
  ).json;
  const nba = scores.find((s) => s.league === "NBA");
  check(
    "scores include the test members",
    !!nba?.voices.some((v) => v.voice === `member:${state.ollie}`),
    nba?.voices,
  );
  out.scores = nba?.voices;
  // The newest snapshot counts tonight's results, and the call for an open game cites it.
  const newest = await until(
    "the new trust snapshot's blob",
    async () => {
      const rows = await db
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.namespace, ns.trust(state.group)),
            like(memories.text, "TRUST snapshot league=NBA %"),
          ),
        );
      const last = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return last?.status === "stored" ? last : null;
    },
    300_000,
    10_000,
  );
  const open = (
    await api<{ id: string; league: string }[]>(`/api/groups/${state.group}/events`)
  ).json.filter((e) => e.league === "NBA");
  const call = await until(
    "a call citing the new snapshot",
    async () => {
      const c = (await api<Call>(`/api/groups/${state.group}/calls/${open[0]?.id}`)).json;
      return c.source?.blobId === newest.blobId ? c : null;
    },
    300_000,
    20_000,
  );
  check("a resolved real game moved the trust snapshot, and the call cites it", true, {
    blob: newest.blobId,
    text: newest.text.slice(0, 160),
    call: call.chips,
  });
  // 4. The nudge: Ollie's insight memory is recalled when he logs another sure pick.
  const insight = await until(
    "Ollie's insight memory",
    async () => {
      const [row] = await db
        .select()
        .from(memories)
        .where(
          and(eq(memories.namespace, ns.insights(state.ollie)), eq(memories.status, "stored")),
        );
      return row ?? null;
    },
    300_000,
    10_000,
  );
  out.insight = insight.text;
  const nudge = await until(
    "a nudge on a sure pick",
    async () => {
      for (const e of open) {
        const r = await api<{ nudge: { text: string; blobId?: string } | null; error?: string }>(
          "/api/picks",
          {
            body: {
              groupId: state.group,
              memberId: state.ollie,
              eventId: e.id,
              side: "no",
              confidence: 0.9,
            },
          },
        );
        if (r.status === 201) return r.json.nudge ?? false;
      }
      return null;
    },
    120_000,
    30_000,
  );
  check(
    "a nudge fires for the overconfident test member",
    !!nudge && nudge.blobId === insight.blobId,
    nudge,
  );
  // Memories on the relayer, counted per namespace.
  const relayer = new RelayerExtras({
    key: env.MEMWAL_PRIVATE_KEY as string,
    accountId: env.MEMWAL_ACCOUNT_ID as string,
    serverUrl: env.MEMWAL_SERVER_URL,
  });
  const counts: Record<string, number> = {};
  for (const n of [
    ns.picks(state.group),
    ns.trust(state.group),
    ns.radar(state.group),
    ns.insights(state.ollie),
  ]) {
    counts[n] = (await relayer.stats(n)).memory_count;
  }
  out.relayerCounts = counts;
  check(
    "memories on the mainnet relayer",
    Object.values(counts).reduce((s, n) => s + n, 0) >= 10,
    counts,
  );
  const anchored = await db
    .select()
    .from(picks)
    .where(and(eq(picks.groupId, state.group), isNotNull(picks.anchorId)));
  out.anchoredPicks = anchored.length;
}

out.finishedAt = new Date().toISOString();
writeFileSync(`test-results/receipts-exit-${stage}.json`, JSON.stringify(out, null, 2));
console.log(
  process.exitCode ? "EXIT FAILED" : "EXIT PASSED",
  `test-results/receipts-exit-${stage}.json`,
);
process.exit();
