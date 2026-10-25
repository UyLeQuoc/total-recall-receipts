import { ChartLine } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { StatTile } from "@/components/app/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CurvePoint } from "../api.ts";
import { ErrorNote, Spinner, Tag } from "../components/receipts.tsx";
import { useLearning } from "../hooks.ts";

/** Remora's chart tokens: the call in the primary indigo, the books in amber, the average muted. */
const SERIES = [
  { key: "weighted", label: "Receipts' call", color: "var(--chart-1)", width: 2.5 },
  { key: "average", label: "Plain average", color: "var(--muted-foreground)", width: 1.5 },
  { key: "books", label: "The books", color: "var(--chart-3)", width: 1.5 },
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
    <figure className="flex flex-col gap-3">
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
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
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
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Is Receipts getting better? Walking forward through every resolved market, each call is
        weighted only by what was learned before it. Lower is better. Backfilled games (NBA since
        Oct 20, recent EPL) are real lines and real results, fetched after the fact and labelled.
      </p>
      {learning.isPending ? <Spinner /> : null}
      <ErrorNote error={learning.error} />
      {learning.data && !learning.data.length ? (
        <EmptyState
          icon={<ChartLine />}
          title="Nothing resolved yet"
          description="The curve starts once a game this group can be scored on is final."
        />
      ) : null}
      <div className="flex flex-col gap-6" data-testid="learning">
        {learning.data?.map((lg) => {
          const last = lg.curve.at(-1);
          return (
            <section key={lg.league} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{lg.league}</h2>
                <div className="flex gap-1">
                  <Tag>{lg.curve.length} games</Tag>
                  <Badge variant="warning">{lg.backfilled} backfilled</Badge>
                </div>
              </div>
              {last ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Receipts' call"
                    value={last.weighted.toFixed(3)}
                    hint={`Brier after ${last.n} games`}
                  />
                  <StatTile label="Plain average" value={last.average.toFixed(3)} />
                  <StatTile
                    label="The books"
                    value={last.books !== null ? last.books.toFixed(3) : "—"}
                  />
                </div>
              ) : null}
              <Card className="px-5">
                <Curve points={lg.curve} title={`${lg.league} learning curve`} />
                {lg.curve.every(
                  (p) =>
                    Math.abs(p.weighted - p.average) < 1e-9 &&
                    Math.abs(p.average - (p.books ?? p.average)) < 1e-9,
                ) ? (
                  <p className="text-xs text-muted-foreground">
                    Only one voice has a number for these games, so the three lines are the same.
                  </p>
                ) : null}
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
