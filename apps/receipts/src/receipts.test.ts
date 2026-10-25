import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  forecastsOf,
  insightsOf,
  insightText,
  type MarketProbs,
  newestTrust,
  parseInsight,
  parseRadar,
  parseTrust,
  radarOf,
  radarText,
  trustText,
} from "./learn.ts";
import {
  bookHomeProb,
  impliedFromAmerican,
  normalise,
  parseConfidence,
  pickProb,
} from "./markets.ts";
import { buildTree, canonicalPick, leafHash, type PickLeaf, rootFromProof } from "./merkle.ts";
import {
  blend,
  brier,
  calibration,
  shrink,
  statsByVoice,
  walkForward,
  weightsFor,
} from "./scoring.ts";
import { espnDate, parseLine, parseScoreboard } from "./sources/espn.ts";
import { nbaEventTicker } from "./sources/kalshi.ts";
import { homeIndex, nbaSlug } from "./sources/polymarket.ts";
import { nbaCode } from "./sources/teams.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "../test/fixtures", name), "utf8"));

describe("odds", () => {
  it("turns American odds into implied probabilities", () => {
    expect(impliedFromAmerican(+120)).toBeCloseTo(100 / 220);
    expect(impliedFromAmerican(-150)).toBeCloseTo(0.6);
    expect(() => impliedFromAmerican(0)).toThrow();
  });
  it("removes the vig, and counts a draw as no", () => {
    expect(normalise([0.6, 0.5]).reduce((s, p) => s + p)).toBeCloseTo(1);
    // BOS -148 / NY +124 (DraftKings, Oct 23)
    expect(bookHomeProb({ home: -148, away: 124 })).toBeCloseTo(0.572, 2);
    expect(bookHomeProb({ home: 190, away: 135, draw: 265 })).toBeLessThan(0.35);
  });
  it("reads confidence as 50–99%", () => {
    expect(parseConfidence("70")).toBe(0.7);
    expect(parseConfidence("70%")).toBe(0.7);
    expect(parseConfidence(0.9)).toBe(0.9);
    expect(parseConfidence(45)).toBeNull();
    expect(parseConfidence(100)).toBeNull();
    expect(pickProb("no", 0.7)).toBeCloseTo(0.3);
  });
});

describe("Merkle receipts", () => {
  const pick = (i: number): PickLeaf => ({
    id: `p${i}`,
    groupId: "g",
    memberId: "m",
    eventId: `e${i}`,
    side: i % 2 ? "yes" : "no",
    confidence: 0.6 + i / 100,
    createdAt: "2026-10-24T16:00:00.000Z",
  });
  it("hashes the same pick the same way, whatever the key order", () => {
    const p = pick(1);
    const shuffled = {
      createdAt: p.createdAt,
      side: p.side,
      confidence: p.confidence,
      eventId: p.eventId,
      memberId: p.memberId,
      groupId: p.groupId,
      id: p.id,
    };
    expect(canonicalPick(shuffled)).toBe(canonicalPick(p));
    expect(leafHash(shuffled)).toBe(leafHash(p));
  });
  it("proves every leaf of odd and even batches", () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const leaves = Array.from({ length: n }, (_, i) => leafHash(pick(i)));
      const { root, proofs } = buildTree(leaves);
      for (const [i, leaf] of leaves.entries())
        expect(rootFromProof(leaf, proofs[i] ?? [])).toBe(root);
    }
  });
  it("fails a tampered pick", () => {
    const leaves = [0, 1, 2].map((i) => leafHash(pick(i)));
    const { root, proofs } = buildTree(leaves);
    const forged = leafHash({ ...pick(1), confidence: 0.99 });
    expect(rootFromProof(forged, proofs[1] ?? [])).not.toBe(root);
  });
});

describe("scoring", () => {
  const at = new Date("2026-10-20T00:00:00Z");
  it("shrinks a short record toward a coin flip", () => {
    expect(shrink(0, 0.1)).toBeCloseTo(0.25);
    expect(shrink(100, 0.1)).toBeLessThan(0.11);
    expect(brier(0.8, 1)).toBeCloseTo(0.04);
  });
  it("weights the better voice more, and never to zero", () => {
    const w = weightsFor([
      { voice: "books", shrunk: 0.18 },
      { voice: "member:x", shrunk: 0.4 },
    ]);
    expect(w.books).toBeGreaterThan(w["member:x"] as number);
    expect(w["member:x"]).toBeGreaterThan(0);
  });
  it("blends over the voices present, giving unknown voices the smallest weight", () => {
    const b = blend({ books: 0.6, kalshi: 0.7 }, { books: 0.8 });
    expect(b?.prob).toBeCloseTo(0.65);
    expect(blend({}, {})).toBeNull();
  });
  it("counts hits and calibration bands", () => {
    const f = [
      { voice: "a", eventId: "1", league: "NBA", prob: 0.9, outcome: 1 as const, at },
      { voice: "a", eventId: "2", league: "NBA", prob: 0.9, outcome: 0 as const, at },
      { voice: "a", eventId: "3", league: "NBA", prob: 0.3, outcome: 0 as const, at },
    ];
    const [s] = statsByVoice(f);
    expect(s?.n).toBe(3);
    expect(s?.hits).toBe(2);
    expect(calibration(f).find((b) => b.from === 0.9)).toEqual({ from: 0.9, n: 2, hits: 1 });
  });
  it("walks forward without peeking at the market it calls", () => {
    const markets = Array.from({ length: 6 }, (_, i) => ({
      eventId: `e${i}`,
      league: "NBA",
      at: new Date(at.getTime() + i * 3600_000),
      outcome: 1 as const,
      // `good` is always right, `bad` always wrong: the weighted call should beat the average.
      probs: { good: 0.8, bad: 0.2 },
    }));
    const curve = walkForward(markets);
    expect(curve).toHaveLength(6);
    expect(curve[0]?.weighted).toBeCloseTo(curve[0]?.average as number);
    expect(curve.at(-1)?.weighted).toBeLessThan(curve.at(-1)?.average as number);
  });
});

describe("what Receipts writes to memory", () => {
  it("round-trips a trust snapshot and picks the newest for a league", () => {
    const s = {
      league: "NBA",
      asOf: "2026-10-24T16:11Z",
      events: 28,
      voices: [{ voice: "books", n: 28, brier: 0.2011, hits: 19, weight: 0.41 }],
    };
    const text = trustText(s);
    expect(parseTrust(`[source] [by:@receipts] [2026-10-24] ${text}`)?.events).toBe(28);
    expect(parseTrust(text)).toEqual({
      ...s,
      voices: [{ ...s.voices[0], brier: 0.201, weight: 0.41 }],
    });
    const older = trustText({ ...s, asOf: "2026-10-23T10:00Z", events: 12 });
    const pickd = newestTrust(
      [
        { blobId: "old", text: older, body: older, distance: 0.3 },
        { blobId: "new", text, body: text, distance: 0.5 },
      ],
      "NBA",
    );
    expect(pickd?.r.blobId).toBe("new");
  });
  it("round-trips the radar and the insight", () => {
    const r = {
      league: "NBA",
      asOf: "2026-10-24T16:11Z",
      disagreements: 9,
      booksCloser: 6,
      marketsCloser: 3,
    };
    expect(parseRadar(radarText(r))).toEqual(r);
    const i = { memberId: "abc", league: "NBA", n: 7, hits: 2, avgConfidence: 0.9 };
    expect(parseInsight(insightText(i))).toEqual(i);
  });
  it("finds overconfidence, and leaves a good record alone", () => {
    const at = new Date();
    const markets: MarketProbs[] = Array.from({ length: 6 }, (_, i) => ({
      eventId: `e${i}`,
      league: "NBA",
      at,
      outcome: (i < 2 ? 1 : 0) as 0 | 1,
      probs: { "member:ollie": 0.9, "member:ava": 0.2 },
    }));
    const insights = insightsOf(forecastsOf(markets), ["ollie", "ava"]);
    expect(insights.map((x) => x.memberId)).toEqual(["ollie"]);
    expect(insights[0]).toMatchObject({ n: 6, hits: 2 });
  });
  it("counts who was closer when the books and markets disagreed", () => {
    const at = new Date();
    const r = radarOf(
      [
        { eventId: "1", league: "NBA", at, outcome: 1, probs: { books: 0.6, polymarket: 0.5 } },
        { eventId: "2", league: "NBA", at, outcome: 1, probs: { books: 0.6, polymarket: 0.61 } },
        { eventId: "3", league: "NBA", at, outcome: 0, probs: { books: 0.6, kalshi: 0.4 } },
      ],
      "NBA",
      "now",
    );
    expect(r).toMatchObject({ disagreements: 2, booksCloser: 1, marketsCloser: 1 });
  });
});

describe("sources", () => {
  it("parses a scheduled ESPN game with its moneyline", () => {
    const [g] = parseScoreboard(fixture("espn-nba-scheduled.json"), "NBA");
    expect(g).toMatchObject({
      league: "NBA",
      status: "scheduled",
      home: { abbr: "CHA" },
      away: { abbr: "MIA" },
      homeScore: null,
    });
    expect(g?.line?.home).toBeGreaterThan(0);
  });
  it("reads the pickcenter line kept after a game", () => {
    const line = parseLine(fixture("espn-nba-summary.json").pickcenter[0]);
    expect(line).toMatchObject({ home: -148, away: 124 });
  });
  it("names Polymarket slugs and Kalshi tickers the way they do", () => {
    expect(nbaCode("NY")).toBe("NYK");
    expect(nbaCode("UTAH")).toBe("UTA");
    expect(nbaSlug("NYK", "BOS", "2026-10-23")).toBe("nba-nyk-bos-2026-10-23");
    expect(nbaEventTicker("NYK", "BOS", "2026-10-23")).toBe("KXNBAGAME-26OCT23NYKBOS");
    expect(espnDate(new Date("2026-10-24T02:00:00Z"))).toBe("20261023");
    const m = {
      slug: "",
      question: "",
      outcomes: ["Knicks", "Celtics"],
      prices: [0.43, 0.57],
      tokenIds: [],
      closed: false,
    };
    expect(homeIndex(m, { short: "Celtics", name: "Boston Celtics" })).toBe(1);
  });
});
