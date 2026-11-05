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
        Lower Brier is better: a coin flip scores 0.25, and few results pull a score toward it.
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
      {scores.data?.map((lg) => {
        const voices = [...lg.voices].sort((a, b) => a.shrunk - b.shrunk);
        const top = voices[0];
        return (
          <Section key={lg.league} title={lg.league}>
            {top ? (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                Most trusted:
                <span className="text-xl font-semibold text-foreground">{top.label}</span>
                <span className="tabular text-xl font-semibold">{top.shrunk.toFixed(3)}</span>
              </p>
            ) : null}
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table className="min-w-[22rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 w-10 pl-3">#</TableHead>
                    <TableHead className="h-8">Voice</TableHead>
                    <TableHead className="h-8 text-right">Right</TableHead>
                    <TableHead className="h-8 text-right">Brier</TableHead>
                    <TableHead className="h-8 pr-3 text-right">Trust score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular">
                  {voices.map((v, i) => {
                    const agent = v.voice.startsWith("agent:");
                    const member = agent || v.voice.startsWith("member:");
                    return (
                      <TableRow key={v.voice} className={cn(i === 0 && "bg-muted")}>
                        <TableCell className="py-1.5 pl-3 text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className={cn("py-1.5", member && "font-medium")}>
                          <span className="inline-flex items-center gap-2">
                            {v.label}
                            {agent ? <StateBadge state="agent" /> : null}
                            {member ? null : <StateBadge state="source" />}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-muted-foreground">
                          {v.hits}/{v.n}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-muted-foreground">
                          {v.brier.toFixed(3)}
                        </TableCell>
                        <TableCell className="py-1.5 pr-3 text-right font-semibold">
                          {v.shrunk.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {lg.calibration.length ? (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Calibration:</span>
                {lg.calibration.map((b) => (
                  <span key={b.from} className="tabular">
                    {pct(b.from)}+ → right {b.hits}/{b.n}
                  </span>
                ))}
              </p>
            ) : null}
          </Section>
        );
      })}
    </>
  );
}
