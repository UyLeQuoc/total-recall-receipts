/**
 * ESPN's public JSON (ADR-0061): fixtures, status and scores from the scoreboard, and the book line
 * (DraftKings moneylines) from the scoreboard before a game or from the summary's pickcenter after it.
 */
import { type Fetch, getJson } from "./http.ts";

export type League = "NBA" | "EPL";
const PATH: Record<League, string> = { NBA: "basketball/nba", EPL: "soccer/eng.1" };
const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface Team {
  abbr: string;
  name: string;
  short: string;
}

export interface BookLine {
  provider: string;
  home: number;
  away: number;
  draw?: number;
}

export interface EspnGame {
  espnId: string;
  league: League;
  startsAt: Date;
  status: "scheduled" | "live" | "final" | "other";
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  line: BookLine | null;
}

interface RawCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team: { abbreviation: string; displayName: string; shortDisplayName?: string; name?: string };
}
interface RawOdds {
  provider?: { name?: string };
  moneyline?: {
    home?: { close?: { odds?: string }; open?: { odds?: string } };
    away?: { close?: { odds?: string }; open?: { odds?: string } };
  };
  drawOdds?: { moneyLine?: number };
  homeTeamOdds?: { moneyLine?: number };
  awayTeamOdds?: { moneyLine?: number };
}
interface RawEvent {
  id: string;
  date: string;
  competitions: {
    status: { type: { state: string; completed: boolean } };
    competitors: RawCompetitor[];
    odds?: (RawOdds | null)[];
  }[];
}

const american = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/^\+/, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** The moneylines from either shape ESPN uses: `moneyline.{home,away}.close.odds` or `*TeamOdds.moneyLine`. */
export function parseLine(o: RawOdds | null | undefined): BookLine | null {
  if (!o) return null;
  const home =
    american(o.moneyline?.home?.close?.odds) ??
    american(o.moneyline?.home?.open?.odds) ??
    american(o.homeTeamOdds?.moneyLine);
  const away =
    american(o.moneyline?.away?.close?.odds) ??
    american(o.moneyline?.away?.open?.odds) ??
    american(o.awayTeamOdds?.moneyLine);
  if (home === null || away === null) return null;
  const draw = american(o.drawOdds?.moneyLine);
  return {
    provider: o.provider?.name ?? "book",
    home,
    away,
    ...(draw === null ? {} : { draw }),
  };
}

const team = (c: RawCompetitor): Team => ({
  abbr: c.team.abbreviation,
  name: c.team.displayName,
  short: c.team.shortDisplayName ?? c.team.name ?? c.team.displayName,
});

export function parseScoreboard(json: { events?: RawEvent[] }, league: League): EspnGame[] {
  const out: EspnGame[] = [];
  for (const e of json.events ?? []) {
    const c = e.competitions[0];
    if (!c) continue;
    const home = c.competitors.find((x) => x.homeAway === "home");
    const away = c.competitors.find((x) => x.homeAway === "away");
    if (!home || !away) continue;
    const { state, completed } = c.status.type;
    const status =
      state === "pre" ? "scheduled" : state === "in" ? "live" : completed ? "final" : "other";
    const score = (x: RawCompetitor) => (x.score === undefined ? null : Number(x.score));
    out.push({
      espnId: e.id,
      league,
      startsAt: new Date(e.date),
      status,
      home: team(home),
      away: team(away),
      homeScore: status === "scheduled" ? null : score(home),
      awayScore: status === "scheduled" ? null : score(away),
      line: parseLine(c.odds?.find((o) => o) ?? null),
    });
  }
  return out;
}

/** `YYYYMMDD`, the date ESPN files a game under (US Eastern). */
export function espnDate(d: Date): string {
  const et = new Date(d.getTime() - 4 * 3600_000);
  return et.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function fetchScoreboard(league: League, date: string, fetchFn?: Fetch) {
  const json = await getJson<{ events?: RawEvent[] }>(
    `${BASE}/${PATH[league]}/scoreboard?dates=${date}`,
    fetchFn,
  );
  return parseScoreboard(json, league);
}

/** The pickcenter line survives the game, so the backfill gets the book's closing number. */
export async function fetchSummaryLine(league: League, espnId: string, fetchFn?: Fetch) {
  const json = await getJson<{ pickcenter?: RawOdds[] }>(
    `${BASE}/${PATH[league]}/summary?event=${espnId}`,
    fetchFn,
  );
  return parseLine(json.pickcenter?.[0]);
}
