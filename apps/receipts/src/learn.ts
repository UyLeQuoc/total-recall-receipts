/**
 * What Receipts learns (RC3, ADR-0061), and how it acts on it.
 *
 * - After results land, a **trust snapshot** per (group, league) goes to memory: every voice's Brier,
 *   hits and weight. A **radar** memory records who was closer when the books and the markets disagreed.
 * - Receipts' own call reads its weights **from the recalled snapshot**, not from the DB, and cites it.
 * - A member's overconfidence becomes an **insight** memory, and logging a pick recalls it as a nudge.
 */
import { and, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { type Db, events, members, memories, picks, quotes } from "./db/index.ts";
import { pct, pickProb, type Side } from "./markets.ts";
import { ns, type Recalled, type ReceiptsMemory } from "./memory.ts";
import {
  blend,
  type Forecast,
  plainAverage,
  statsByVoice,
  type VoiceStats,
  weightsFor,
} from "./scoring.ts";

export const SOURCE_VOICES = ["books", "polymarket", "kalshi"] as const;
export const memberVoice = (id: string) => `member:${id}`;
/** An agent is its own voice, by its key (ADR-0066), so its record follows the agent, not the group seat. */
export const agentVoice = (address: string) => `agent:${address}`;
/** A disagreement worth remembering: the books and a market at least this far apart. */
export const RADAR_GAP = 0.03;
export const INSIGHT_MIN_N = 5;
export const INSIGHT_CONFIDENCE = 0.8;

// ---------- the snapshot's text: written once, parsed back from recall ----------

export interface TrustSnapshot {
  league: string;
  asOf: string;
  events: number;
  voices: { voice: string; n: number; brier: number; hits: number; weight: number }[];
}

export function trustText(s: TrustSnapshot): string {
  const parts = s.voices.map(
    (v) =>
      `${v.voice} n=${v.n} brier=${v.brier.toFixed(3)} hits=${v.hits} w=${v.weight.toFixed(3)}`,
  );
  return `TRUST snapshot league=${s.league} as_of=${s.asOf} events=${s.events} | ${parts.join(" | ")}`;
}

export function parseTrust(text: string): TrustSnapshot | null {
  const head = /TRUST snapshot league=(\S+) as_of=(\S+) events=(\d+)/.exec(text);
  if (!head) return null;
  const voices = text
    .split(" | ")
    .slice(1)
    .map((seg) => /^(\S+) n=(\d+) brier=([\d.]+) hits=(\d+) w=([\d.]+)/.exec(seg.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({
      voice: m[1] as string,
      n: Number(m[2]),
      brier: Number(m[3]),
      hits: Number(m[4]),
      weight: Number(m[5]),
    }));
  return { league: head[1] as string, asOf: head[2] as string, events: Number(head[3]), voices };
}

export interface Radar {
  league: string;
  asOf: string;
  disagreements: number;
  booksCloser: number;
  marketsCloser: number;
}

export const radarText = (r: Radar) =>
  `RADAR league=${r.league} as_of=${r.asOf} gap>=${Math.round(RADAR_GAP * 100)}pts disagreements=${r.disagreements} books_closer=${r.booksCloser} markets_closer=${r.marketsCloser}`;

export function parseRadar(text: string): Radar | null {
  const m =
    /RADAR league=(\S+) as_of=(\S+) gap>=\d+pts disagreements=(\d+) books_closer=(\d+) markets_closer=(\d+)/.exec(
      text,
    );
  return m
    ? {
        league: m[1] as string,
        asOf: m[2] as string,
        disagreements: Number(m[3]),
        booksCloser: Number(m[4]),
        marketsCloser: Number(m[5]),
      }
    : null;
}

export interface Insight {
  memberId: string;
  league: string;
  n: number;
  hits: number;
  avgConfidence: number;
}

export const insightText = (i: Insight) =>
  `INSIGHT member=${i.memberId} league=${i.league} overconfident: picks at >=${pct(INSIGHT_CONFIDENCE)} hit ${i.hits} of ${i.n} (average confidence ${pct(i.avgConfidence)})`;

export function parseInsight(text: string): Insight | null {
  const m =
    /INSIGHT member=(\S+) league=(\S+) overconfident: picks at >=\d+% hit (\d+) of (\d+) \(average confidence (\d+)%\)/.exec(
      text,
    );
  return m
    ? {
        memberId: m[1] as string,
        league: m[2] as string,
        hits: Number(m[3]),
        n: Number(m[4]),
        avgConfidence: Number(m[5]) / 100,
      }
    : null;
}

// ---------- reading the DB into forecasts ----------

export interface MarketProbs {
  eventId: string;
  league: string;
  at: Date;
  outcome: 0 | 1 | null;
  probs: Record<string, number>;
}

/** Each market's numbers: the sources' quotes (global) plus this group's picks. */
export async function marketProbs(
  db: Db,
  groupId: string,
  eventIds?: string[],
): Promise<MarketProbs[]> {
  const evs = await db
    .select()
    .from(events)
    .where(eventIds ? inArray(events.id, eventIds.length ? eventIds : [""]) : undefined);
  if (!evs.length) return [];
  const ids = evs.map((e) => e.id);
  const qs = await db.select().from(quotes).where(inArray(quotes.eventId, ids));
  const ps = await db
    .select()
    .from(picks)
    .where(and(eq(picks.groupId, groupId), inArray(picks.eventId, ids)));
  const agents = new Map(
    (
      await db
        .select({ id: members.id, address: members.address })
        .from(members)
        .where(and(eq(members.groupId, groupId), isNotNull(members.agentOf)))
    ).map((a) => [a.id, agentVoice(a.address ?? a.id)]),
  );
  const by = new Map<string, MarketProbs>(
    evs.map((e) => [
      e.id,
      {
        eventId: e.id,
        league: e.league,
        at: e.startsAt,
        outcome: e.outcome === null ? null : (e.outcome as 0 | 1),
        probs: {},
      },
    ]),
  );
  for (const q of qs) {
    const m = by.get(q.eventId);
    if (m) m.probs[q.voice] = q.prob;
  }
  for (const p of ps) {
    const m = by.get(p.eventId);
    const voice = agents.get(p.memberId) ?? memberVoice(p.memberId);
    if (m) m.probs[voice] = pickProb(p.side as Side, p.confidence);
  }
  return [...by.values()];
}

export function forecastsOf(markets: MarketProbs[]): Forecast[] {
  return markets.flatMap((m) =>
    m.outcome === null
      ? []
      : Object.entries(m.probs).map(([voice, prob]) => ({
          voice,
          eventId: m.eventId,
          league: m.league,
          prob,
          outcome: m.outcome as 0 | 1,
          at: m.at,
        })),
  );
}

export function radarOf(markets: MarketProbs[], league: string, asOf: string): Radar {
  let disagreements = 0;
  let booksCloser = 0;
  let marketsCloser = 0;
  for (const m of markets) {
    if (m.league !== league || m.outcome === null) continue;
    const books = m.probs.books;
    const mk = [m.probs.polymarket, m.probs.kalshi].filter((p): p is number => p !== undefined);
    if (books === undefined || !mk.length) continue;
    const market = mk.reduce((s, p) => s + p, 0) / mk.length;
    if (Math.abs(books - market) < RADAR_GAP) continue;
    disagreements++;
    if (Math.abs(books - m.outcome) < Math.abs(market - m.outcome)) booksCloser++;
    else marketsCloser++;
  }
  return { league, asOf, disagreements, booksCloser, marketsCloser };
}

export function insightsOf(forecasts: Forecast[], memberIds: string[]): Insight[] {
  const out: Insight[] = [];
  for (const id of memberIds) {
    const mine = forecasts.filter((f) => f.voice === memberVoice(id));
    for (const league of new Set(mine.map((f) => f.league))) {
      const sure = mine.filter(
        (f) => f.league === league && Math.max(f.prob, 1 - f.prob) >= INSIGHT_CONFIDENCE,
      );
      if (sure.length < INSIGHT_MIN_N) continue;
      const hits = sure.filter((f) => (f.outcome === 1 ? f.prob > 0.5 : f.prob < 0.5)).length;
      const avgConfidence =
        sure.reduce((s, f) => s + Math.max(f.prob, 1 - f.prob), 0) / sure.length;
      if (hits / sure.length <= avgConfidence - 0.2) {
        out.push({ memberId: id, league, n: sure.length, hits, avgConfidence });
      }
    }
  }
  return out;
}

// ---------- writing what was learned ----------

async function lastWritten(db: Db, namespace: string, prefix: string) {
  const [row] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.namespace, namespace), like(memories.text, `${prefix}%`)))
    .orderBy(desc(memories.createdAt))
    .limit(1);
  return row ?? null;
}

export interface LearnResult {
  trust: string[];
  radar: string[];
  insights: string[];
}

/**
 * Writes a trust snapshot (and radar) per league whose resolved count changed since the last one,
 * and an insight per newly overconfident member. Cheap to call after every ingest pass.
 */
export async function learn(
  deps: { db: Db; memory: ReceiptsMemory },
  groupId: string,
  now = new Date(),
): Promise<LearnResult> {
  const { db, memory } = deps;
  const result: LearnResult = { trust: [], radar: [], insights: [] };
  const markets = await marketProbs(db, groupId);
  const forecasts = forecastsOf(markets);
  const asOf = now.toISOString().slice(0, 16).concat("Z");
  for (const league of new Set(forecasts.map((f) => f.league))) {
    const resolved = markets.filter((m) => m.league === league && m.outcome !== null).length;
    const prev = await lastWritten(db, ns.trust(groupId), `TRUST snapshot league=${league} `);
    if (prev && parseTrust(prev.text)?.events === resolved) continue;
    const stats = statsByVoice(forecasts.filter((f) => f.league === league));
    const weights = weightsFor(stats);
    const snapshot: TrustSnapshot = {
      league,
      asOf,
      events: resolved,
      voices: stats
        .sort((a, b) => a.shrunk - b.shrunk)
        .map((s) => ({
          voice: s.voice,
          n: s.n,
          brier: s.brier,
          hits: s.hits,
          weight: weights[s.voice] ?? 0,
        })),
    };
    const t = await memory.remember(ns.trust(groupId), "source", trustText(snapshot));
    result.trust.push(t.id);
    const radar = radarOf(markets, league, asOf);
    if (radar.disagreements) {
      const r = await memory.remember(ns.radar(groupId), "source", radarText(radar));
      result.radar.push(r.id);
    }
  }
  const ms = await db.select().from(members).where(eq(members.groupId, groupId));
  for (const i of insightsOf(
    forecasts,
    ms.map((m) => m.id),
  )) {
    const text = insightText(i);
    const prev = await lastWritten(
      db,
      ns.insights(i.memberId),
      `INSIGHT member=${i.memberId} league=${i.league} `,
    );
    if (prev && parseInsight(prev.text)?.n === i.n) continue;
    const w = await memory.remember(ns.insights(i.memberId), "gotcha", text);
    result.insights.push(w.id);
  }
  return result;
}

// ---------- acting on it ----------

export interface Chip {
  text: string;
  blobId?: string;
  memoryId?: string;
}

export interface ReceiptsCall {
  eventId: string;
  prob: number | null;
  average: number | null;
  weights: Record<string, number>;
  /** The trust snapshot the weights came from, or null (equal weights, said plainly). */
  source: { blobId: string; asOf: string; memoryId?: string } | null;
  chips: Chip[];
}

/** Newest snapshot for a league among the recalled ones. */
export function newestTrust(recalled: Recalled[], league: string) {
  return recalled
    .map((r) => ({ r, s: parseTrust(r.body) }))
    .filter((x): x is { r: Recalled; s: TrustSnapshot } => !!x.s && x.s.league === league)
    .sort((a, b) => b.s.asOf.localeCompare(a.s.asOf) || b.s.events - a.s.events)[0];
}

export function newestRadar(recalled: Recalled[], league: string) {
  return recalled
    .map((r) => ({ r, s: parseRadar(r.body) }))
    .filter((x): x is { r: Recalled; s: Radar } => !!x.s && x.s.league === league)
    .sort((a, b) => b.s.asOf.localeCompare(a.s.asOf))[0];
}

/** Recall is slow (~seconds) and rate-limited, so one page asks once per league per minute. */
const cache = new Map<string, { at: number; value: Recalled[] }>();
const CACHE_MS = 60_000;

export async function recallCached(memory: ReceiptsMemory, namespace: string, query: string) {
  const key = `${namespace}|${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await memory.recall(namespace, query, 10);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearRecallCache() {
  cache.clear();
}

export async function receiptsCall(
  deps: { db: Db; memory: ReceiptsMemory; labels: (voice: string) => string },
  groupId: string,
  eventId: string,
): Promise<ReceiptsCall> {
  const [m] = await marketProbs(deps.db, groupId, [eventId]);
  if (!m) throw new Error(`no event ${eventId}`);
  const chips: Chip[] = [];
  let trust: ReturnType<typeof newestTrust>;
  let radar: ReturnType<typeof newestRadar>;
  try {
    trust = newestTrust(
      await recallCached(
        deps.memory,
        ns.trust(groupId),
        `TRUST snapshot league=${m.league} weights per voice`,
      ),
      m.league,
    );
    radar = newestRadar(
      await recallCached(
        deps.memory,
        ns.radar(groupId),
        `RADAR league=${m.league} books vs markets disagreements`,
      ),
      m.league,
    );
  } catch {
    chips.push({ text: "Walrus Memory didn't answer, so every voice counts the same this time." });
  }
  const weights = Object.fromEntries((trust?.s.voices ?? []).map((v) => [v.voice, v.weight]));
  const call = blend(m.probs, weights);
  const indexed = async (blobId: string) => {
    const [row] = await deps.db
      .select({ id: memories.id })
      .from(memories)
      .where(and(eq(memories.blobId, blobId), isNotNull(memories.blobId)));
    return row?.id;
  };
  if (trust && call) {
    const memoryId = await indexed(trust.r.blobId);
    const ranked = trust.s.voices
      .filter((v) => m.probs[v.voice] !== undefined)
      .sort((a, b) => b.weight - a.weight);
    const top = ranked[0];
    const bottom = ranked.length > 1 ? ranked.at(-1) : undefined;
    if (top) {
      chips.push({
        text: `Leaning on ${deps.labels(top.voice)} for ${m.league} (${top.hits} of ${top.n} right, Brier ${top.brier.toFixed(3)})`,
        blobId: trust.r.blobId,
        ...(memoryId ? { memoryId } : {}),
      });
    }
    if (bottom && bottom.voice !== top?.voice) {
      chips.push({
        text: `Least weight on ${deps.labels(bottom.voice)} (${bottom.hits} of ${bottom.n}, Brier ${bottom.brier.toFixed(3)})`,
        blobId: trust.r.blobId,
        ...(memoryId ? { memoryId } : {}),
      });
    }
  } else if (!trust && !chips.length) {
    chips.push({ text: `No trust memory for ${m.league} yet, so every voice counts the same.` });
  }
  const books = m.probs.books;
  const mk = [m.probs.polymarket, m.probs.kalshi].filter((p): p is number => p !== undefined);
  if (radar && books !== undefined && mk.length) {
    const market = mk.reduce((s, p) => s + p, 0) / mk.length;
    const gap = Math.abs(books - market);
    if (gap >= RADAR_GAP) {
      const r = radar.s;
      const leader = r.booksCloser >= r.marketsCloser ? "the books" : "the markets";
      const wins = Math.max(r.booksCloser, r.marketsCloser);
      chips.push({
        text: `Books and markets disagree by ${Math.round(gap * 100)} pts. On ${m.league} disagreements, ${leader} were closer ${wins} of ${r.disagreements}`,
        blobId: radar.r.blobId,
      });
    }
  }
  return {
    eventId,
    prob: call?.prob ?? null,
    average: plainAverage(m.probs),
    weights: call?.used ?? {},
    source: trust ? { blobId: trust.r.blobId, asOf: trust.s.asOf } : null,
    chips,
  };
}

/** The nudge for a sure pick: the member's insight for this league, recalled from memory. */
export async function nudgeFor(
  memory: ReceiptsMemory,
  memberId: string,
  league: string,
  confidence: number,
): Promise<Chip | null> {
  if (confidence < INSIGHT_CONFIDENCE) return null;
  const recalled = await memory.recall(
    ns.insights(memberId),
    `INSIGHT member=${memberId} league=${league} overconfident`,
    5,
  );
  const hit = recalled
    .map((r) => ({ r, i: parseInsight(r.body) }))
    .find((x) => x.i && x.i.league === league && x.i.memberId === memberId);
  if (!hit?.i) return null;
  return {
    text: `Your ${pct(INSIGHT_CONFIDENCE)}+ picks in ${league} have hit ${hit.i.hits} of ${hit.i.n}. Still ${pct(confidence)}?`,
    blobId: hit.r.blobId,
  };
}

export type { VoiceStats };
