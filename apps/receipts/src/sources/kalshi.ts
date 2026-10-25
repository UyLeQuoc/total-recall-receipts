/**
 * Kalshi's public market data (ADR-0061). An NBA game is `KXNBAGAME-<YY><MON><DD><AWAY><HOME>`, with
 * one market per team (`…-BOS`); candlesticks give the price before tip-off.
 */
import { type Fetch, getJson } from "./http.ts";

const BASE = "https://api.elections.kalshi.com/trade-api/v2";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** `isoDate` is the game's US date, as ESPN files it. */
export function nbaEventTicker(away: string, home: string, isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `KXNBAGAME-${(y ?? "").slice(2)}${MONTHS[Number(m) - 1]}${d}${away}${home}`;
}

export interface KalshiMarket {
  ticker: string;
  status: string;
  result: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
}

const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

export async function fetchMarket(ticker: string, fetchFn?: Fetch): Promise<KalshiMarket | null> {
  try {
    const { market } = await getJson<{ market: Record<string, string> }>(
      `${BASE}/markets/${ticker}`,
      fetchFn,
    );
    return {
      ticker,
      status: market.status ?? "",
      result: market.result ?? "",
      last: num(market.last_price_dollars),
      bid: num(market.yes_bid_dollars),
      ask: num(market.yes_ask_dollars),
    };
  } catch (err) {
    if (String(err).includes("404")) return null;
    throw err;
  }
}

/** The market's probability now: the mid of a live book, else the last trade. */
export function liveProb(m: KalshiMarket): number | null {
  if (m.bid !== null && m.ask !== null && m.ask > 0 && m.ask >= m.bid) return (m.bid + m.ask) / 2;
  return m.last;
}

/** The last hourly close at or before `ts` (seconds). */
export async function priceBefore(series: string, ticker: string, ts: number, fetchFn?: Fetch) {
  const { candlesticks } = await getJson<{
    candlesticks: { end_period_ts: number; price: { close_dollars?: string } }[];
  }>(
    `${BASE}/series/${series}/markets/${ticker}/candlesticks?start_ts=${ts - 6 * 3600}&end_ts=${ts}&period_interval=60`,
    fetchFn,
  );
  const last = candlesticks.filter((c) => c.end_period_ts <= ts && c.price.close_dollars).at(-1);
  return last ? { prob: Number(last.price.close_dollars), t: last.end_period_ts } : null;
}
