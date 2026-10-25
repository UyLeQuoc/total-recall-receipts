/**
 * Scoring (ADR-0061): Brier per (voice × league), shrunk toward a coin flip, and weights from the
 * shrunk score. Pure, so the backfill curve, the trust snapshot and the tests share one definition.
 */

export const PRIOR_BRIER = 0.25;
export const SHRINK_K = 5;
const MIN_SKILL = 0.01;

export interface Forecast {
  voice: string;
  eventId: string;
  league: string;
  /** P(yes). */
  prob: number;
  outcome: 0 | 1;
  at: Date;
}

export interface VoiceStats {
  voice: string;
  league: string;
  n: number;
  brier: number;
  shrunk: number;
  hits: number;
}

export const brier = (p: number, o: 0 | 1) => (p - o) ** 2;
export const shrink = (n: number, mean: number) =>
  (n * mean + SHRINK_K * PRIOR_BRIER) / (n + SHRINK_K);
/** A call is a hit when it leaned the right way; a 50/50 call leans nowhere. */
export const isHit = (p: number, o: 0 | 1) => (o === 1 ? p > 0.5 : p < 0.5);

export function statsByVoice(forecasts: Forecast[]): VoiceStats[] {
  const acc = new Map<
    string,
    { voice: string; league: string; n: number; sum: number; hits: number }
  >();
  for (const f of forecasts) {
    const key = `${f.voice}|${f.league}`;
    const a = acc.get(key) ?? { voice: f.voice, league: f.league, n: 0, sum: 0, hits: 0 };
    a.n++;
    a.sum += brier(f.prob, f.outcome);
    if (isHit(f.prob, f.outcome)) a.hits++;
    acc.set(key, a);
  }
  return [...acc.values()].map((a) => ({
    voice: a.voice,
    league: a.league,
    n: a.n,
    brier: a.sum / a.n,
    shrunk: shrink(a.n, a.sum / a.n),
    hits: a.hits,
  }));
}

/** Weight ∝ skill over a coin flip, floored so no voice is silenced by a short bad run. */
export function weightsFor(stats: Pick<VoiceStats, "voice" | "shrunk">[]): Record<string, number> {
  const raw = stats.map((s) => [s.voice, Math.max(PRIOR_BRIER - s.shrunk, MIN_SKILL)] as const);
  const sum = raw.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(raw.map(([v, w]) => [v, sum ? w / sum : 0]));
}

/**
 * The weighted call over the voices that have a number for this market. Voices without a learned
 * weight get the smallest learned weight (or an equal share when nothing is learned yet).
 */
export function blend(
  probs: Record<string, number>,
  weights: Record<string, number>,
): { prob: number; used: Record<string, number> } | null {
  const voices = Object.keys(probs);
  if (!voices.length) return null;
  const known = voices.map((v) => weights[v]).filter((w): w is number => w !== undefined);
  const fallback = known.length ? Math.min(...known) : 1;
  const used = Object.fromEntries(voices.map((v) => [v, weights[v] ?? fallback]));
  const total = Object.values(used).reduce((s, w) => s + w, 0);
  const prob = voices.reduce((s, v) => s + (probs[v] as number) * (used[v] as number), 0) / total;
  return {
    prob,
    used: Object.fromEntries(Object.entries(used).map(([v, w]) => [v, w / total])),
  };
}

export function plainAverage(probs: Record<string, number>): number | null {
  const v = Object.values(probs);
  return v.length ? v.reduce((s, p) => s + p, 0) / v.length : null;
}

export interface Bucket {
  from: number;
  n: number;
  hits: number;
}

/** Hit rate per 10-point band of how sure a voice was (its side's probability). */
export function calibration(forecasts: Pick<Forecast, "prob" | "outcome">[]): Bucket[] {
  const buckets = new Map<number, Bucket>();
  for (const f of forecasts) {
    const sure = Math.max(f.prob, 1 - f.prob);
    const from = Math.min(Math.floor(sure * 10) / 10, 0.9);
    const b = buckets.get(from) ?? { from, n: 0, hits: 0 };
    b.n++;
    if (isHit(f.prob, f.outcome)) b.hits++;
    buckets.set(from, b);
  }
  return [...buckets.values()].sort((a, b) => a.from - b.from);
}

export interface CurvePoint {
  eventId: string;
  at: Date;
  n: number;
  /** Mean Brier so far (lower is better). */
  weighted: number;
  average: number;
  books: number | null;
}

/**
 * Walk forward through resolved markets: each call uses only weights learned from earlier results,
 * the way Receipts would have called it that day. The backfill's learning curve.
 */
export function walkForward(
  markets: {
    eventId: string;
    league: string;
    at: Date;
    outcome: 0 | 1;
    probs: Record<string, number>;
  }[],
): CurvePoint[] {
  const sorted = [...markets].sort((a, b) => a.at.getTime() - b.at.getTime());
  const seen: Forecast[] = [];
  const points: CurvePoint[] = [];
  let w = 0;
  let a = 0;
  let b = 0;
  let nb = 0;
  for (const m of sorted) {
    const stats = statsByVoice(seen.filter((f) => f.league === m.league));
    const call = blend(m.probs, weightsFor(stats));
    const avg = plainAverage(m.probs);
    if (!call || avg === null) continue;
    w += brier(call.prob, m.outcome);
    a += brier(avg, m.outcome);
    const book = m.probs.books;
    if (book !== undefined) {
      b += brier(book, m.outcome);
      nb++;
    }
    const n = points.length + 1;
    points.push({
      eventId: m.eventId,
      at: m.at,
      n,
      weighted: w / n,
      average: a / n,
      books: nb ? b / nb : null,
    });
    for (const [voice, prob] of Object.entries(m.probs)) {
      seen.push({
        voice,
        eventId: m.eventId,
        league: m.league,
        prob,
        outcome: m.outcome,
        at: m.at,
      });
    }
  }
  return points;
}
