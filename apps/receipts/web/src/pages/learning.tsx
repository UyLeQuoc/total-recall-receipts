import { useParams } from "react-router";
import type { CurvePoint } from "../api.ts";
import { Badge, Card, ErrorNote, Spinner } from "../components/ui.tsx";
import { useLearning } from "../hooks.ts";

const SERIES = [
  { key: "weighted", label: "Receipts' call", color: "var(--color-accent)", width: 2.5 },
  { key: "average", label: "Plain average", color: "var(--color-muted)", width: 1.5 },
  { key: "books", label: "The books", color: "var(--color-pending)", width: 1.5 },
] as const;

/** Mean Brier so far (lower is better) after each resolved game, walking forward in time. */
function Curve({ points, title }: { points: CurvePoint[]; title: string }) {
  if (points.length < 2) return <p className="text-sm text-muted">Not enough games yet.</p>;
  const w = 640;
  const h = 240;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
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
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text
              x={pad.l - 6}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--color-muted)"
            >
              {t.toFixed(3)}
            </text>
          </g>
        ))}
        <text x={w - pad.r} y={h - 8} textAnchor="end" fontSize="11" fill="var(--color-muted)">
          {points.length} games →
        </text>
        {SERIES.map((s) => (
          <polyline
            key={s.key}
            points={path((p) => (s.key === "books" ? p.books : p[s.key]))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function LearningPage() {
  const { id = "" } = useParams();
  const learning = useLearning(id);
  return (
    <div>
      <p className="max-w-2xl text-sm text-muted">
        Is Receipts getting better? Walking forward through every resolved market, each call is
        weighted only by what was learned before it. Lower is better. Backfilled games (NBA since
        Oct 20, recent EPL) are real lines and real results, fetched after the fact and labelled.
      </p>
      {learning.isPending ? <Spinner /> : null}
      <ErrorNote error={learning.error} />
      <div className="mt-4 flex flex-col gap-4" data-testid="learning">
        {learning.data?.map((lg) => {
          const last = lg.curve.at(-1);
          return (
            <Card key={lg.league}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{lg.league}</h2>
                <div className="flex gap-1">
                  <Badge>{lg.curve.length} games</Badge>
                  <Badge tone="pending">{lg.backfilled} backfilled</Badge>
                </div>
              </div>
              {last ? (
                <p className="tabular mt-1 text-sm text-muted">
                  After {last.n} games: Receipts {last.weighted.toFixed(3)} · average{" "}
                  {last.average.toFixed(3)}
                  {last.books !== null ? ` · books ${last.books.toFixed(3)}` : ""}
                </p>
              ) : null}
              <div className="mt-3">
                <Curve points={lg.curve} title={`${lg.league} learning curve`} />
              </div>
              {lg.curve.every(
                (p) =>
                  Math.abs(p.weighted - p.average) < 1e-9 &&
                  Math.abs(p.average - (p.books ?? p.average)) < 1e-9,
              ) ? (
                <p className="mt-2 text-xs text-muted">
                  Only one voice has a number for these games, so the three lines are the same.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
