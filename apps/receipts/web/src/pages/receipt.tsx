import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router";
import { api, type Chip, type Receipt, type Verification } from "../api.ts";
import {
  Badge,
  BrainChip,
  Button,
  Card,
  ErrorNote,
  SectionTitle,
  Spinner,
} from "../components/ui.tsx";
import { pct, short, when } from "../format.ts";
import { usePick, useVerify } from "../hooks.ts";

/** A copy someone edited: a different signature when there is one, else a bolder confidence. */
function tampered(r: Receipt): Receipt {
  const sig = r.pick.signature;
  if (sig) {
    const i = Math.floor(sig.length / 2);
    const flipped = `${sig.slice(0, i)}${sig[i] === "A" ? "B" : "A"}${sig.slice(i + 1)}`;
    return { ...r, pick: { ...r.pick, signature: flipped } };
  }
  return { ...r, pick: { ...r.pick, confidence: 0.99 } };
}

function Checks({ v, testId }: { v: Verification; testId: string }) {
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {v.checks.map((c) => (
        <li
          key={c.name}
          data-check={c.name}
          data-ok={c.ok}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-sm"
        >
          <span className={c.ok ? "text-accent" : "text-bad"}>
            <span aria-hidden>{c.ok ? "✓" : "✗"}</span>
            <span className="sr-only">{c.ok ? "Passed:" : "Failed:"}</span>
          </span>
          <span className="min-w-0">
            <span className="font-medium">{c.name}</span>
            <span className="block break-all font-mono text-xs text-muted">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function verdict(v: Verification) {
  if (v.ok) return <Badge tone="good">Verified on Sui</Badge>;
  const unanchored = v.checks.some((c) => c.name === "anchored on Sui" && !c.ok);
  const others = v.checks.filter((c) => c.name !== "anchored on Sui");
  if (unanchored && others.every((c) => c.ok)) {
    return (
      <Badge tone="pending">
        {v.signed ? "Signed, waiting for its anchor" : "Waiting for its anchor"}
      </Badge>
    );
  }
  return <Badge tone="bad">Not verified</Badge>;
}

export function ReceiptPage() {
  const { pickId = "" } = useParams();
  const location = useLocation();
  const nudge = (location.state as { nudge?: Chip | null } | null)?.nudge ?? null;
  const page = usePick(pickId);
  const verify = useVerify(pickId);
  const tamper = useMutation({
    mutationFn: (r: Receipt) => api<Verification>("/api/verify", tampered(r)),
  });

  if (page.isPending) return <Spinner label="Loading the receipt…" />;
  if (page.isError) return <ErrorNote error={page.error} />;
  const { receipt: r, member, event, group, sideLabel, explorer } = page.data;
  const resolved = event && event.outcome !== null;
  const right = resolved && (event.outcome === 1) === (r.pick.side === "yes");

  return (
    <div className="mx-auto max-w-2xl">
      {group ? (
        <Link to={`/g/${group.id}`} className="text-sm text-muted hover:text-ink">
          ← {group.name}
        </Link>
      ) : null}
      {nudge ? (
        <div className="mt-3" data-testid="nudge">
          <BrainChip chip={nudge} groupId={r.pick.groupId} />
        </div>
      ) : null}

      <div className="receipt-edge mt-3 rounded-t-2xl border border-b-0 border-line bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">🧾 Receipt</p>
          {event ? <Badge>{event.league}</Badge> : null}
        </div>
        <h1 className="mt-2 text-xl font-bold tracking-tight">{r.event.title}</h1>
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Who</dt>
          <dd className="font-medium">{member?.label ?? r.pick.memberId}</dd>
          <dt className="text-muted">Pick</dt>
          <dd className="font-medium">
            {sideLabel} at <span className="tabular">{pct(r.pick.confidence)}</span>
          </dd>
          <dt className="text-muted">Logged</dt>
          <dd className="tabular">{when(r.pick.createdAt)}</dd>
          <dt className="text-muted">Locks</dt>
          <dd className="tabular">{when(r.event.locksAt)}</dd>
          {resolved ? (
            <>
              <dt className="text-muted">Result</dt>
              <dd>
                {right ? <Badge tone="good">right</Badge> : <Badge tone="bad">wrong</Badge>}{" "}
                <span className="text-muted">{event?.detail}</span>
              </dd>
            </>
          ) : null}
          <dt className="text-muted">Signed by</dt>
          <dd className="min-w-0">
            {r.pick.signer ? (
              <span className="break-all font-mono text-xs" data-testid="signer">
                {r.pick.signer}
              </span>
            ) : (
              <span className="text-muted">
                No wallet signature:{" "}
                {member?.telegram ? "picked through Telegram" : "picked through the API"}.
              </span>
            )}
          </dd>
        </dl>
        {r.signedMessage ? (
          <details className="mt-4 rounded-xl bg-paper p-3 text-xs">
            <summary className="cursor-pointer font-medium">What the wallet signed</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-muted">
              {r.signedMessage}
            </pre>
          </details>
        ) : null}
        <p className="mt-4 break-all font-mono text-[11px] text-muted">leaf {r.leaf}</p>
      </div>

      <SectionTitle aside={verify.data ? verdict(verify.data) : null}>Verify</SectionTitle>
      <Card>
        {verify.isPending ? <Spinner label="Checking against Sui…" /> : null}
        <ErrorNote error={verify.error} />
        {verify.data ? <Checks v={verify.data} testId="checks" /> : null}
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-sm font-medium underline underline-offset-2"
          >
            Anchor transaction on Suiscan (testnet) ↗
          </a>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Not anchored yet. Batches go out every 10 minutes, and right away before a lock.
          </p>
        )}
      </Card>

      <Card className="mt-4">
        <p className="font-semibold">Don't trust us: try to fake it</p>
        <p className="mt-1 text-sm text-muted">
          Send an edited copy of this receipt to the same checks.{" "}
          {r.pick.signature
            ? "The copy has one character of the signature changed."
            : "The copy claims 99% confidence."}
        </p>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => tamper.mutate(r)}
          disabled={tamper.isPending}
        >
          {tamper.isPending ? "Checking…" : "Verify a tampered copy"}
        </Button>
        <ErrorNote error={tamper.error} />
        {tamper.data ? (
          <div className="mt-3">
            <div className="mb-2">{verdict(tamper.data)}</div>
            <Checks v={tamper.data} testId="tampered-checks" />
          </div>
        ) : null}
        <p className="mt-4 text-xs text-muted">
          Anyone can run these checks with{" "}
          <a className="underline" href={`/api/receipts/${r.pick.id}`}>
            the receipt JSON
          </a>{" "}
          and any Sui node: <code className="font-mono">POST /api/verify</code>.
          {r.pick.signer ? ` Signer ${short(r.pick.signer)}.` : ""}
        </p>
      </Card>
    </div>
  );
}
