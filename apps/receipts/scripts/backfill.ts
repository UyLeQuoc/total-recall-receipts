// RC6 (ADR-0061): backfill real results with the real pre-game numbers, labelled `backfill`.
// NBA since opening week (Oct 20) and recent EPL weekends. Lines come from ESPN's pickcenter,
// Polymarket's CLOB history and Kalshi's candlesticks, each taken before tip-off.
//   bun --env-file=../../.env scripts/backfill.ts [fromYYYYMMDD] [toYYYYMMDD]
import { count, eq } from "drizzle-orm";
import { createDb, events, quotes } from "../src/db/index.ts";
import { readEnv } from "../src/env.ts";
import { ingestDay } from "../src/ingest.ts";

const env = readEnv();
const db = createDb(env.DATABASE_URL);
const log = (msg: string, data: Record<string, unknown> = {}) =>
  console.log(msg, JSON.stringify(data));

function days(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}T12:00:00Z`);
  const end = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}T12:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1))
    out.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
  return out;
}

const nbaFrom = process.argv[2] ?? "20261020";
const to = process.argv[3] ?? "20261023";
for (const date of days(nbaFrom, to)) await ingestDay({ db, log }, "NBA", date, true);
for (const date of days("20260919", "20261024")) await ingestDay({ db, log }, "EPL", date, true);

const byVoice = await db
  .select({ voice: quotes.voice, n: count() })
  .from(quotes)
  .where(eq(quotes.backfill, true))
  .groupBy(quotes.voice);
const resolved = await db
  .select({ league: events.league, n: count() })
  .from(events)
  .where(eq(events.backfill, true))
  .groupBy(events.league);
console.log({ resolved, quotes: byVoice });
process.exit(0);
