/**
 * Polymarket (ADR-0061): an NBA game is the event `nba-<away>-<home>-<YYYY-MM-DD>`, its `moneyline`
 * market's outcomes are the two teams, and the CLOB keeps the price history before tip-off.
 */
import { type Fetch, getJson } from "./http.ts";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

interface RawMarket {
  question: string;
  slug?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  sportsMarketType?: string;
  closed?: boolean;
  endDate?: string;
}
interface RawEvent {
  slug: string;
  title: string;
  closed?: boolean;
  endDate?: string;
  markets: RawMarket[];
}

export interface PmMarket {
  slug: string;
  question: string;
  outcomes: string[];
  prices: number[];
  tokenIds: string[];
  closed: boolean;
  endDate?: string;
}

/** Gamma sends lists as JSON strings, and leaves them out on some markets. */
const list = (raw: string | undefined): string[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

const parse = (m: RawMarket, slug: string): PmMarket => ({
  slug,
  question: m.question,
  outcomes: list(m.outcomes),
  prices: list(m.outcomePrices).map(Number),
  tokenIds: list(m.clobTokenIds),
  closed: !!m.closed,
  ...(m.endDate ? { endDate: m.endDate } : {}),
});

export async function fetchEvent(slug: string, fetchFn?: Fetch): Promise<RawEvent | null> {
  const list = await getJson<RawEvent[]>(
    `${GAMMA}/events?slug=${encodeURIComponent(slug)}`,
    fetchFn,
  );
  return list[0] ?? null;
}

/** The game's moneyline market, or null when Polymarket has no such event. */
export async function fetchGameMoneyline(slug: string, fetchFn?: Fetch): Promise<PmMarket | null> {
  const e = await fetchEvent(slug, fetchFn);
  const m = e?.markets.find((x) => x.sportsMarketType === "moneyline");
  return m && e ? parse(m, e.slug) : null;
}

/** Every market of an event (elections: one per side or candidate). */
export async function fetchEventMarkets(slug: string, fetchFn?: Fetch): Promise<PmMarket[]> {
  const e = await fetchEvent(slug, fetchFn);
  return e ? e.markets.map((m) => parse(m, e.slug)) : [];
}

export const nbaSlug = (away: string, home: string, isoDate: string) =>
  `nba-${away.toLowerCase()}-${home.toLowerCase()}-${isoDate}`;

/** Which outcome is the home team: by name, else Polymarket's [away, home] order. */
export function homeIndex(m: PmMarket, home: { short: string; name: string }): number {
  const i = m.outcomes.findIndex(
    (o) => o === home.short || home.name.endsWith(o) || o.endsWith(home.short),
  );
  return i >= 0 ? i : 1;
}

/** The last traded price at or before `ts` (seconds), looking back 6 hours. */
export async function priceBefore(tokenId: string, ts: number, fetchFn?: Fetch) {
  const { history } = await getJson<{ history: { t: number; p: number }[] }>(
    `${CLOB}/prices-history?market=${tokenId}&startTs=${ts - 6 * 3600}&endTs=${ts}&fidelity=10`,
    fetchFn,
  );
  const last = history.filter((h) => h.t <= ts).at(-1);
  return last ? { prob: last.p, t: last.t } : null;
}
