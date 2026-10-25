/** Odds and market math (ADR-0061). Every market is binary; a voice's number is P(yes). */

/** American odds to the implied probability, vig included: +120 → 0.4545, -150 → 0.6. */
export function impliedFromAmerican(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) throw new Error(`bad American odds: ${odds}`);
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/** Removes the vig: the outcomes' implied probabilities scaled to sum to 1. */
export function normalise(probs: number[]): number[] {
  const sum = probs.reduce((s, p) => s + p, 0);
  if (sum <= 0) throw new Error("probabilities must sum to more than 0");
  return probs.map((p) => p / sum);
}

/** P(home wins) from the book's moneylines; a draw (soccer) counts as "no". */
export function bookHomeProb(line: { home: number; away: number; draw?: number }): number {
  const raw = [line.home, line.away, ...(line.draw === undefined ? [] : [line.draw])].map(
    impliedFromAmerican,
  );
  return normalise(raw)[0] as number;
}

export type Side = "yes" | "no";

/** A pick's probability of yes: "no at 70%" is P(yes) = 0.3. */
export function pickProb(side: Side, confidence: number): number {
  return side === "yes" ? confidence : 1 - confidence;
}

export const MIN_CONFIDENCE = 0.5;
export const MAX_CONFIDENCE = 0.99;

export function parseConfidence(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  const c = n > 1 ? n / 100 : n;
  if (c < MIN_CONFIDENCE || c > MAX_CONFIDENCE) return null;
  return Math.round(c * 100) / 100;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
