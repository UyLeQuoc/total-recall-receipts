/**
 * NBA team codes. ESPN shortens a few (NY, GS, NO, SA, UTAH, WSH); Polymarket's slugs and Kalshi's
 * tickers use the standard three letters (`nba-nyk-bos-2026-10-23`, `KXNBAGAME-26OCT23NYKBOS`).
 */
const NBA_STANDARD: Record<string, string> = {
  NY: "NYK",
  GS: "GSW",
  NO: "NOP",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};

export function nbaCode(espnAbbr: string): string {
  const a = espnAbbr.toUpperCase();
  return NBA_STANDARD[a] ?? a;
}
