import { Bot, ChartLine } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import type { CurvePoint, LeagueScores } from "../api.ts";
import { ErrorNote, Spinner, StateBadge, Tag } from "../components/receipts.tsx";
import { useLearning, useScores } from "../hooks.ts";

/** Remora's chart tokens: the call in the primary indigo and thickest; the field thin, the books dashed. */
const SERIES = [
  {
    key: "weighted",
    label: "Receipts' call",
    color: "var(--primary)",
    width: 2.5,
    dash: undefined,
  },
  {
    key: "average",
    label: "Plain average",
    color: "var(--muted-foreground)",
    width: 1,
    dash: undefined,
  },
  {
    key: "books",
    label: "The books",
    color: "color-mix(in oklab, var(--muted-foreground) 45%, var(--foreground))",
    width: 1,
    dash: "5 3",
  },
] as const;

/** Mean Brier so far (lower is better) after each resolved game, walking forward in time. */
function Curve({ points, title }: { points: CurvePoint[]; title: string }) {
  if (points.length < 2)
    return <p className="text-sm text-muted-foreground">Not enough games yet.</p>;
  const w = 640;
  const h = 240;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const values = points.flatMap((p) => [p.weighted, p.average, p.books ?? p.average]);
  const lo = Math.max(0, Math.min(...values) - 0.01);
  const hi = Math.max(...values) + 0.01;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = (pick: (p: CurvePoint) => number | null) =>
    points
      .map((p, i) => {
        const v = pick(p);
        return v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text
              x={pad.l - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {t.toFixed(3)}
            </text>
          </g>
        ))}
        <text x={w - pad.r} y={h - 8} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
          {points.length} games →
        </text>
        {SERIES.map((s) => (
          <polyline
            key={s.key}
            points={path((p) => (s.key === "books" ? p.books : p[s.key]))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 16 8" className="h-2 w-4 shrink-0" aria-hidden>
              <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                strokeLinecap="round"
              />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

const SOURCES = new Set(["books", "polymarket", "kalshi"]);

/**
 * Agents next to the field (ADR-0066): each agent's Brier beside the books, the markets and the best
 * person, so an owner sees whether their agent earns its trust.
 */
function AgentsVsField({ scores }: { scores: LeagueScores[] }) {
  const leagues = scores
    .map((lg) => {
      const agents = lg.voices.filter((v) => v.voice.startsWith("agent:"));
      const sources = lg.voices.filter((v) => SOURCES.has(v.voice));
      const people = lg.voices.filter((v) => v.voice.startsWith("member:")).slice(0, 1);
      return { league: lg.league, rows: [...agents, ...sources, ...people], agents: agents.length };
    })
    .filter((lg) => lg.agents);
  if (!leagues.length) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="agents-vs-field">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="size-4 text-primary" aria-hidden />
        Agents next to the field
      </h2>
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {leagues.map((lg) => (
          <div key={lg.league} className="px-3 py-2">
            <p className="text-sm font-medium">{lg.league}</p>
            <ul className="flex flex-col text-sm">
              {[...lg.rows]
                .sort((a, b) => a.shrunk - b.shrunk)
                .map((v) => (
                  <li key={v.voice} className="flex items-center justify-between gap-3 py-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{v.label}</span>
                      {v.voice.startsWith("agent:") ? <StateBadge state="agent" /> : null}
                      {SOURCES.has(v.voice) ? <StateBadge state="source" /> : null}
                    </span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      {v.hits}/{v.n} ·{" "}
                      <span className="font-medium text-foreground">{v.brier.toFixed(3)}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LearningPage() {
  const { id = "" } = useParams();
  const learning = useLearning(id);
  const scores = useScores(id);
  const leagues = (learning.data ?? []).filter((lg) => lg.curve.length > 0);
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each call is weighted only by what was known before it.
      </p>
      {learning.isPending ? <Spinner /> : null}
      <ErrorNote error={learning.error} />
      {learning.data && !leagues.length ? (
        <EmptyState
          icon={<ChartLine />}
          title="Nothing resolved yet"
          description="The curve starts once a game this group can be scored on is final."
        />
      ) : null}
      {scores.data ? <AgentsVsField scores={scores.data} /> : null}
      {leagues.length ? (
        <div className="grid items-start gap-4 xl:grid-cols-2" data-testid="learning">
          {leagues.map((lg) => {
            const last = lg.curve.at(-1);
            const gap =
              last && last.books !== null ? Number((last.weighted - last.books).toFixed(3)) : null;
            const compared =
              gap === null
                ? null
                : gap === 0
                  ? "Same as the books"
                  : gap < 0
                    ? `${Math.abs(gap).toFixed(3)} better than the books`
                    : `${gap.toFixed(3)} worse than the books`;
            return (
              <section key={lg.league} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{lg.league}</h2>
                  <div className="flex gap-1">
                    <Tag>{lg.curve.length} games</Tag>
                    {lg.backfilled ? (
                      <Badge variant="outline">{lg.backfilled} backfilled</Badge>
                    ) : null}
                  </div>
                </div>
                {last ? (
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Receipts' call</p>
                      <p className="text-3xl font-semibold tabular text-primary">
                        {last.weighted.toFixed(3)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Plain average</p>
                      <p className="text-lg tabular text-muted-foreground">
                        {last.average.toFixed(3)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">The books</p>
                      <p className="text-lg tabular text-muted-foreground">
                        {last.books !== null ? last.books.toFixed(3) : "—"}
                      </p>
                    </div>
                    {compared ? (
                      <p className="text-xs text-muted-foreground">
                        {compared} · after {last.n} games
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">after {last.n} games</p>
                    )}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 pt-1">
                  <Curve points={lg.curve} title={`${lg.league} learning curve`} />
                  {lg.curve.length >= 2 &&
                  lg.curve.every(
                    (p) =>
                      Math.abs(p.weighted - p.average) < 1e-9 &&
                      Math.abs(p.average - (p.books ?? p.average)) < 1e-9,
                  ) ? (
                    <p className="text-xs text-muted-foreground">
                      Only one voice has a number for these games, so the three lines are the same.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
