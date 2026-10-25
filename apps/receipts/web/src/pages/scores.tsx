import { cn } from "cn";
import { Trophy } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorNote, Spinner, StateBadge } from "../components/receipts.tsx";
import { pct } from "../format.ts";
import { useScores } from "../hooks.ts";

export function ScoresPage() {
  const { id = "" } = useParams();
  const scores = useScores(id);
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Brier score: the squared gap between a forecast and what happened. Lower is better; a coin
        flip scores 0.25. Each voice's score is shrunk toward 0.25 until it has enough results, so
        one lucky call doesn't top the table. Backfilled games count, and they're real lines and
        real results.
      </p>
      {scores.isPending ? <Spinner /> : null}
      <ErrorNote error={scores.error} />
      {scores.data && !scores.data.length ? (
        <EmptyState
          icon={<Trophy />}
          title="Nothing has resolved yet"
          description="The table fills in once the group's first game is final."
        />
      ) : null}
      {scores.data?.map((lg) => (
        <Section key={lg.league} title={lg.league}>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table className="min-w-[22rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">#</TableHead>
                  <TableHead>Voice</TableHead>
                  <TableHead className="text-right">Right</TableHead>
                  <TableHead className="text-right">Brier</TableHead>
                  <TableHead className="pr-4 text-right">Trust score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular">
                {lg.voices.map((v, i) => {
                  const member = v.voice.startsWith("member:");
                  return (
                    <TableRow key={v.voice}>
                      <TableCell className="pl-4 text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className={cn(member && "font-medium")}>
                        <span className="inline-flex items-center gap-2">
                          {v.label}
                          {member ? null : <StateBadge state="source" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {v.hits}/{v.n}
                      </TableCell>
                      <TableCell className="text-right">{v.brier.toFixed(3)}</TableCell>
                      <TableCell className="pr-4 text-right font-medium">
                        {v.shrunk.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {lg.calibration.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Calibration: when someone said…
              </p>
              <div className="flex flex-wrap gap-2">
                {lg.calibration.map((b) => (
                  <span
                    key={b.from}
                    className="tabular rounded-md border bg-card px-2 py-1 text-xs"
                  >
                    {pct(b.from)}+ → right {b.hits}/{b.n}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
      ))}
    </>
  );
}
