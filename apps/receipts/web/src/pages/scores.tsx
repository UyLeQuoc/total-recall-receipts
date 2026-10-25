import { useParams } from "react-router";
import { Badge, Card, cx, ErrorNote, Spinner } from "../components/ui.tsx";
import { pct } from "../format.ts";
import { useScores } from "../hooks.ts";

export function ScoresPage() {
  const { id = "" } = useParams();
  const scores = useScores(id);
  return (
    <div>
      <p className="max-w-2xl text-sm text-muted">
        Brier score: the squared gap between a forecast and what happened. Lower is better; a coin
        flip scores 0.25. Each voice's score is shrunk toward 0.25 until it has enough results, so
        one lucky call doesn't top the table. Backfilled games count, and they're real lines and
        real results.
      </p>
      {scores.isPending ? <Spinner /> : null}
      <ErrorNote error={scores.error} />
      {scores.data && !scores.data.length ? (
        <p className="mt-4 text-sm text-muted">Nothing has resolved yet.</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">
        {scores.data?.map((lg) => (
          <Card key={lg.league}>
            <h2 className="text-lg font-semibold">{lg.league}</h2>
            <div className="-mx-4 mt-3 overflow-x-auto px-4">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">Voice</th>
                    <th className="py-2 pr-2 text-right font-medium">Right</th>
                    <th className="py-2 pr-2 text-right font-medium">Brier</th>
                    <th className="py-2 text-right font-medium">Trust score</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {lg.voices.map((v, i) => {
                    const member = v.voice.startsWith("member:");
                    return (
                      <tr key={v.voice} className="border-t border-line">
                        <td className="py-2 pr-2 text-muted">{i + 1}</td>
                        <td className={cx("py-2 pr-2", member && "font-semibold")}>
                          {v.label} {member ? null : <Badge>source</Badge>}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {v.hits}/{v.n}
                        </td>
                        <td className="py-2 pr-2 text-right">{v.brier.toFixed(3)}</td>
                        <td className="py-2 text-right font-semibold">{v.shrunk.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {lg.calibration.length ? (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Calibration: when someone said…
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lg.calibration.map((b) => (
                    <span
                      key={b.from}
                      className="tabular rounded-lg border border-line px-2 py-1 text-xs"
                    >
                      {pct(b.from)}+ → right {b.hits}/{b.n}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
