import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleCheck,
  CircleX,
  Clock,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Page, Section } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type Chip, type Receipt, type Verification } from "../api.ts";
import { useShowGroup } from "../app/layout.tsx";
import { BrainChip, ErrorNote, Spinner, StateBadge, Tag } from "../components/receipts.tsx";
import { pct, when } from "../format.ts";
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

/** Each check on its own row, the way Remora's Verify page lists what it checks. */
function Checks({ v, testId }: { v: Verification; testId: string }) {
  return (
    <ul className="flex flex-col divide-y" data-testid={testId}>
      {v.checks.map((c) => (
        <li
          key={c.name}
          data-check={c.name}
          data-ok={c.ok}
          className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-2 text-sm first:pt-0 last:pb-0"
        >
          {c.ok ? (
            <CircleCheck className="mt-0.5 size-4 text-success" aria-label="Passed" />
          ) : c.name === "anchored on Sui" && c.detail.includes("not anchored yet") ? (
            <Clock className="mt-0.5 size-4 text-muted-foreground" aria-label="Pending" />
          ) : (
            <CircleX className="mt-0.5 size-4 text-destructive" aria-label="Failed" />
          )}
          <span className="min-w-0">
            <span className="font-medium">{c.name}</span>
            <span className="block font-mono text-xs break-all text-muted-foreground">
              {c.detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function verdict(v: Verification, big = false) {
  const size = big ? "px-3 py-1 text-sm" : undefined;
  if (v.ok)
    return (
      <Badge variant="success" className={size}>
        Verified on Sui
      </Badge>
    );
  const unanchored = v.checks.some((c) => c.name === "anchored on Sui" && !c.ok);
  const others = v.checks.filter((c) => c.name !== "anchored on Sui");
  if (unanchored && others.every((c) => c.ok)) {
    return (
      <Badge variant="warning" className={size}>
        {v.signed ? "Signed, waiting for its anchor" : "Waiting for its anchor"}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className={size}>
      Not verified
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
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
  useShowGroup(page.data?.group?.id);

  if (page.isPending)
    return (
      <Page title="Receipt">
        <Spinner label="Loading the receipt…" />
      </Page>
    );
  if (page.isError)
    return (
      <Page title="Receipt">
        <ErrorNote error={page.error} />
      </Page>
    );
  const { receipt: r, member, event, group, sideLabel, explorer, owner, reason } = page.data;
  const agent = !!r.pick.delegationId;
  const resolved = event && event.outcome !== null;
  const right = resolved && (event.outcome === 1) === (r.pick.side === "yes");

  return (
    <Page title={`Receipt · ${r.event.title}`}>
      {group ? (
        <Link
          to={`/g/${group.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {group.name}
        </Link>
      ) : null}
      {nudge ? (
        <div data-testid="nudge">
          <BrainChip chip={nudge} groupId={r.pick.groupId} />
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <article className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {verify.data ? (
              verdict(verify.data, true)
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <ReceiptText className="size-4 text-primary" aria-hidden />
                Receipt
              </span>
            )}
            {event ? <Tag>{event.league}</Tag> : null}
          </div>
          <p className="mt-2 text-2xl font-semibold">
            {sideLabel} at <span className="tabular">{pct(r.pick.confidence)}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span data-testid="who">{member?.label ?? r.pick.memberId}</span> on {r.event.title} ·
            locks <span className="tabular">{when(r.event.locksAt)}</span>
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t pt-2 text-xs">
            {resolved ? (
              <Row label="Result">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <StateBadge state={right ? "right" : "wrong"} />
                  <span className="text-muted-foreground">{event?.detail}</span>
                </span>
              </Row>
            ) : null}
            {agent && owner ? (
              <Row label="For">
                <span>{owner.label}</span>
              </Row>
            ) : null}
            {agent && reason ? (
              <Row label="Agent's reason">
                <span className="text-muted-foreground" data-testid="reason">
                  “{reason}”
                </span>
              </Row>
            ) : null}
            <Row label="Logged">
              <span className="tabular">{when(r.pick.createdAt)}</span>
            </Row>
            <Row label={agent ? "Agent's key" : "Signed by"}>
              {r.pick.signer ? (
                <span className="font-mono break-all" data-testid="signer">
                  {r.pick.signer}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  No wallet signature:{" "}
                  {member?.telegram ? "picked through Telegram" : "picked through the API"}.
                </span>
              )}
            </Row>
          </dl>
          {r.signedMessage ? (
            <details className="mt-2 border-t pt-2 text-xs">
              <summary className="cursor-pointer font-medium">
                {agent ? "What the agent signed" : "What the wallet signed"}
              </summary>
              <pre className="mt-1 font-mono break-all whitespace-pre-wrap text-muted-foreground">
                {r.signedMessage}
              </pre>
            </details>
          ) : null}
          {r.delegation ? (
            <details className="mt-2 border-t pt-2 text-xs" data-testid="delegation">
              <summary className="cursor-pointer font-medium">
                What the owner signed: the delegation
                {r.delegation.revokedAt ? `, revoked ${when(r.delegation.revokedAt)}` : ""}
              </summary>
              <pre className="mt-1 font-mono break-all whitespace-pre-wrap text-muted-foreground">
                {r.delegation.message}
              </pre>
              {r.delegation.revokeMessage ? (
                <pre className="mt-1 border-t pt-1 font-mono break-all whitespace-pre-wrap text-muted-foreground">
                  {r.delegation.revokeMessage}
                </pre>
              ) : null}
            </details>
          ) : null}
          {/* The tear line of a paper receipt. */}
          <p className="mt-3 border-t pt-2 font-mono text-xs break-all text-muted-foreground">
            leaf {r.leaf}
          </p>
        </article>

        <div className="flex flex-col gap-4">
          <Section title="Verify" description="Checked against Sui through Tatum.">
            {verify.isPending ? <Spinner label="Checking against Sui…" /> : null}
            <ErrorNote error={verify.error} />
            {verify.data ? <Checks v={verify.data} testId="checks" /> : null}
            {explorer ? (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a href={explorer} target="_blank" rel="noreferrer">
                  Anchor transaction on Suiscan (testnet)
                  <ArrowUpRight />
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not anchored yet. Batches go out every 10 minutes, and right away before a lock.
              </p>
            )}
          </Section>

          <Section
            title="Don't trust us: try to fake it"
            description={
              r.pick.signature
                ? "Sends this receipt with one signature character changed."
                : "Sends this receipt claiming 99% confidence."
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => tamper.mutate(r)}
              disabled={tamper.isPending}
            >
              <ShieldCheck />
              {tamper.isPending ? "Checking…" : "Verify a tampered copy"}
            </Button>
            <ErrorNote error={tamper.error} />
            {tamper.data ? (
              <div className="flex flex-col gap-2">
                <div>{verdict(tamper.data)}</div>
                <Checks v={tamper.data} testId="tampered-checks" />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Also checkable with{" "}
              <a className="underline underline-offset-2" href={`/api/receipts/${r.pick.id}`}>
                the receipt JSON
              </a>{" "}
              and <code className="font-mono">POST /api/verify</code>.
            </p>
          </Section>
        </div>
      </div>
    </Page>
  );
}
