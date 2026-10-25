/**
 * Ingest (RC6, ADR-0061): fixtures and results from ESPN, the book line, Polymarket and Kalshi
 * prices. Before lock, each pass refreshes a source's quote (the last one before lock stands). After
 * the game, a missing quote is filled from history and labelled `backfill`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { type Db, events, quotes } from "./db/index.ts";
import { bookHomeProb } from "./markets.ts";
import {
  type EspnGame,
  espnDate,
  fetchScoreboard,
  fetchSummaryLine,
  type League,
} from "./sources/espn.ts";
import type { Fetch } from "./sources/http.ts";
import * as kalshi from "./sources/kalshi.ts";
import * as pm from "./sources/polymarket.ts";
import { nbaCode } from "./sources/teams.ts";

export type Log = (msg: string, data?: Record<string, unknown>) => void;

export interface IngestDeps {
  db: Db;
  fetch?: Fetch;
  log?: Log;
  now?: () => Date;
}

export const eventId = (g: Pick<EspnGame, "league" | "espnId">) =>
  `espn:${g.league.toLowerCase()}:${g.espnId}`;
const isoOf = (yyyymmdd: string) =>
  `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}`;

function eventRow(g: EspnGame, date: string, backfill: boolean) {
  const soccer = g.league === "EPL";
  return {
    id: eventId(g),
    league: g.league,
    kind: "game",
    title: `${g.away.short} at ${g.home.short}`,
    yesLabel: `${g.home.short} win`,
    noLabel: soccer ? `${g.away.short} win or draw` : `${g.away.short} win`,
    startsAt: g.startsAt,
    status: g.status,
    outcome:
      g.status === "final" && g.homeScore !== null && g.awayScore !== null
        ? g.homeScore > g.awayScore
          ? 1
          : 0
        : null,
    resolvedAt: g.status === "final" ? new Date() : null,
    refs: {
      espnId: g.espnId,
      date: isoOf(date),
      home: g.home.abbr,
      away: g.away.abbr,
      homeShort: g.home.short,
      homeName: g.home.name,
    },
    detail:
      g.homeScore !== null && g.awayScore !== null
        ? `${g.away.abbr} ${g.awayScore} – ${g.homeScore} ${g.home.abbr}`
        : null,
    backfill,
  };
}

async function upsertQuote(
  db: Db,
  q: {
    eventId: string;
    voice: string;
    prob: number;
    takenAt: Date;
    backfill: boolean;
    raw?: unknown;
  },
) {
  if (!(q.prob > 0 && q.prob < 1)) return;
  await db
    .insert(quotes)
    .values({ ...q, raw: q.raw ?? null })
    .onConflictDoUpdate({
      target: [quotes.eventId, quotes.voice],
      set: { prob: q.prob, takenAt: q.takenAt, backfill: q.backfill, raw: q.raw ?? null },
    });
}

/** The market numbers for one NBA game, now (live) or just before tip-off (history). */
async function nbaMarketQuotes(
  g: EspnGame,
  date: string,
  mode: "live" | "history",
  fetchFn?: Fetch,
): Promise<{ voice: string; prob: number; raw: unknown }[]> {
  const out: { voice: string; prob: number; raw: unknown }[] = [];
  const away = nbaCode(g.away.abbr);
  const home = nbaCode(g.home.abbr);
  const tip = Math.floor(g.startsAt.getTime() / 1000);
  try {
    const m = await pm.fetchGameMoneyline(pm.nbaSlug(away, home, isoOf(date)), fetchFn);
    if (m) {
      const i = pm.homeIndex(m, g.home);
      if (mode === "live" && !m.closed) {
        out.push({ voice: "polymarket", prob: m.prices[i] as number, raw: { slug: m.slug } });
      } else if (m.tokenIds[i]) {
        const p = await pm.priceBefore(m.tokenIds[i] as string, tip, fetchFn);
        if (p) out.push({ voice: "polymarket", prob: p.prob, raw: { slug: m.slug, t: p.t } });
      }
    }
  } catch {
    // A missing market is normal; the other voices still count.
  }
  try {
    const ticker = `${kalshi.nbaEventTicker(away, home, isoOf(date))}-${home}`;
    if (mode === "live") {
      const k = await kalshi.fetchMarket(ticker, fetchFn);
      const p = k && k.status === "active" ? kalshi.liveProb(k) : null;
      if (p !== null) out.push({ voice: "kalshi", prob: p, raw: { ticker } });
    } else {
      const p = await kalshi.priceBefore("KXNBAGAME", ticker, tip, fetchFn);
      if (p) out.push({ voice: "kalshi", prob: p.prob, raw: { ticker, t: p.t } });
    }
  } catch {
    // Same: Kalshi may not list every game.
  }
  return out;
}

/** One league-day: upsert events, refresh pre-lock quotes, and fill missing ones after the game. */
export async function ingestDay(deps: IngestDeps, league: League, date: string, backfill = false) {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const games = await fetchScoreboard(league, date, deps.fetch);
  let resolved = 0;
  for (const g of games) {
    if (g.status === "other") continue;
    const row = eventRow(g, date, backfill);
    const [prev] = await db.select().from(events).where(eq(events.id, row.id));
    if (prev?.outcome !== null && prev?.outcome !== undefined) continue;
    if (prev) {
      await db
        .update(events)
        .set({
          status: row.status,
          outcome: row.outcome,
          resolvedAt: row.resolvedAt,
          detail: row.detail,
          startsAt: row.startsAt,
        })
        .where(eq(events.id, row.id));
    } else {
      await db.insert(events).values(row);
    }
    if (row.outcome !== null) resolved++;

    const beforeLock = now.getTime() < g.startsAt.getTime() && g.status === "scheduled";
    if (beforeLock) {
      if (g.line) {
        await upsertQuote(db, {
          eventId: row.id,
          voice: "books",
          prob: bookHomeProb(g.line),
          takenAt: now,
          backfill: false,
          raw: g.line,
        });
      }
      if (league === "NBA") {
        for (const q of await nbaMarketQuotes(g, date, "live", deps.fetch)) {
          await upsertQuote(db, {
            eventId: row.id,
            voice: q.voice,
            prob: q.prob,
            takenAt: now,
            backfill: false,
            raw: q.raw,
          });
        }
      }
    } else if (g.status === "final") {
      const have = new Set(
        (
          await db.select({ voice: quotes.voice }).from(quotes).where(eq(quotes.eventId, row.id))
        ).map((q) => q.voice),
      );
      if (!have.has("books")) {
        const line = await fetchSummaryLine(league, g.espnId, deps.fetch).catch(() => null);
        if (line) {
          await upsertQuote(db, {
            eventId: row.id,
            voice: "books",
            prob: bookHomeProb(line),
            takenAt: g.startsAt,
            backfill: true,
            raw: line,
          });
        }
      }
      if (league === "NBA" && (!have.has("polymarket") || !have.has("kalshi"))) {
        for (const q of await nbaMarketQuotes(g, date, "history", deps.fetch)) {
          if (have.has(q.voice)) continue;
          await upsertQuote(db, {
            eventId: row.id,
            voice: q.voice,
            prob: q.prob,
            takenAt: g.startsAt,
            backfill: true,
            raw: q.raw,
          });
        }
      }
    }
  }
  deps.log?.("ingest.day", { league, date, games: games.length, resolved });
  return { games: games.length, resolved };
}

/** Today and tomorrow (US dates) for live work, and yesterday so late results land. */
export async function ingestNow(deps: IngestDeps) {
  const now = deps.now?.() ?? new Date();
  const days = [-1, 0, 1].map((d) => espnDate(new Date(now.getTime() + d * 86_400_000)));
  for (const league of ["NBA", "EPL"] as const) {
    for (const date of days) {
      await ingestDay(deps, league, date).catch((err) =>
        deps.log?.("ingest.failed", { league, date, error: String(err) }),
      );
    }
  }
  await ingestMidterms(deps).catch((err) =>
    deps.log?.("ingest.midterms_failed", { error: String(err) }),
  );
}

// ---------- US midterms (Nov 3, 2026) ----------

/** Polls open at 6 a.m. Eastern on Nov 3; that's the lock. */
export const MIDTERMS_LOCK = new Date("2026-11-03T11:00:00Z");

export const MIDTERM_MARKETS = [
  {
    slug: "which-party-will-win-the-house-in-2026",
    title: "House control",
    yes: "Democrats win the House",
    no: "Republicans win the House",
    pmMatch: /Democratic Party control the House/,
    kalshi: "CONTROLH-2026-D",
  },
  {
    slug: "which-party-will-win-the-senate-in-2026",
    title: "Senate control",
    yes: "Democrats win the Senate",
    no: "Republicans win the Senate",
    pmMatch: /Democratic Party control the Senate/,
    kalshi: "CONTROLS-2026-D",
  },
  {
    slug: "texas-senate-election-winner",
    title: "Texas Senate",
    yes: "Democrat wins Texas",
    no: "Republican wins Texas",
    pmMatch: /Democrats win the Texas Senate/,
  },
  {
    slug: "maine-senate-election-winner",
    title: "Maine Senate",
    yes: "Democrat wins Maine",
    no: "Republican wins Maine",
    pmMatch: /Democrats win the Maine Senate/,
  },
  {
    slug: "michigan-senate-election-winner",
    title: "Michigan Senate",
    yes: "Democrat wins Michigan",
    no: "Republican wins Michigan",
    pmMatch: /Democrats win the Michigan Senate/,
  },
] as const;

export async function ingestMidterms(deps: IngestDeps) {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  for (const spec of MIDTERM_MARKETS) {
    const id = `pm:${spec.slug}`;
    const markets = await pm.fetchEventMarkets(spec.slug, deps.fetch);
    const m = markets.find((x) => spec.pmMatch.test(x.question));
    if (!m) {
      deps.log?.("ingest.midterm_missing", { slug: spec.slug });
      continue;
    }
    const yesIdx = m.outcomes.indexOf("Yes");
    const yes = m.prices[yesIdx >= 0 ? yesIdx : 0];
    if (yes === undefined || Number.isNaN(yes)) continue;
    const outcome = m.closed && (yes === 1 || yes === 0) ? yes : null;
    const [prev] = await db.select().from(events).where(eq(events.id, id));
    const row = {
      id,
      league: "US-MIDTERMS",
      kind: "election",
      title: spec.title,
      yesLabel: spec.yes,
      noLabel: spec.no,
      startsAt: MIDTERMS_LOCK,
      status: outcome === null ? (now < MIDTERMS_LOCK ? "scheduled" : "live") : "final",
      outcome,
      resolvedAt: outcome === null ? null : now,
      refs: {
        slug: spec.slug,
        question: m.question,
        ...("kalshi" in spec ? { kalshi: spec.kalshi } : {}),
      },
      detail: null,
      backfill: false,
    };
    if (prev) {
      await db
        .update(events)
        .set({ status: row.status, outcome: row.outcome, resolvedAt: row.resolvedAt })
        .where(eq(events.id, id));
    } else {
      await db.insert(events).values(row);
    }
    if (now < MIDTERMS_LOCK) {
      await upsertQuote(db, {
        eventId: id,
        voice: "polymarket",
        prob: yes,
        takenAt: now,
        backfill: false,
        raw: { slug: spec.slug },
      });
      if ("kalshi" in spec) {
        const k = await kalshi.fetchMarket(spec.kalshi, deps.fetch).catch(() => null);
        const p = k ? kalshi.liveProb(k) : null;
        if (p !== null) {
          await upsertQuote(db, {
            eventId: id,
            voice: "kalshi",
            prob: p,
            takenAt: now,
            backfill: false,
            raw: { ticker: spec.kalshi },
          });
        }
      }
    }
  }
}

/** Events a group can still pick, soonest first. */
export async function openEvents(db: Db, now = new Date(), withinHours = 48) {
  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.status, "scheduled"), inArray(events.league, ["NBA", "EPL", "US-MIDTERMS"])),
    );
  return rows
    .filter(
      (e) =>
        e.startsAt.getTime() > now.getTime() &&
        (e.league === "US-MIDTERMS" ||
          e.startsAt.getTime() - now.getTime() < withinHours * 3600_000),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
