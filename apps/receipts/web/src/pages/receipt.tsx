import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CircleCheck,
  CircleX,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Page, Section } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type Chip, type Receipt, type Verification } from "../api.ts";
import { useShowGroup } from "../app/layout.tsx";
import { BrainChip, ErrorNote, Spinner, StateBadge, Tag } from "../components/receipts.tsx";
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

/** Each check on its own row, the way Remora's Verify page lists what it checks. */
function Checks({ v, testId }: { v: Verification; testId: string }) {
  return (
    <ul className="flex flex-col divide-y" data-testid={testId}>
      {v.checks.map((c) => (
        <li
          key={c.name}
          data-check={c.name}
          data-ok={c.ok}
          className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-3 text-sm first:pt-0 last:pb-0"
        >
          {c.ok ? (
            <CircleCheck className="mt-0.5 size-4 text-success" aria-label="Passed" />
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

function verdict(v: Verification) {
  if (v.ok) return <Badge variant="success">Verified on Sui</Badge>;
  const unanchored = v.checks.some((c) => c.name === "anchored on Sui" && !c.ok);
  const others = v.checks.filter((c) => c.name !== "anchored on Sui");
  if (unanchored && others.every((c) => c.ok)) {
    return (
      <Badge variant="warning">
        {v.signed ? "Signed, waiting for its anchor" : "Waiting for its anchor"}
      </Badge>
    );
  }
  return <Badge variant="destructive">Not verified</Badge>;
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
    <Page title={`Receipt · ${r.event.title}`} className="max-w-3xl">
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

      <article className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <ReceiptText className="size-4 text-primary" aria-hidden />
            Receipt
          </p>
          {event ? <Tag>{event.league}</Tag> : null}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">{r.event.title}</h1>
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
          <Row label="Who">
            <span className="font-medium" data-testid="who">
              {agent ? (
                <Bot className="mr-1.5 inline size-4 align-[-3px] text-primary" aria-hidden />
              ) : null}
              {member?.label ?? r.pick.memberId}
              {agent ? (
                <Badge variant="accent" className="ml-2 align-middle">
                  agent
                </Badge>
              ) : null}
            </span>
          </Row>
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
          <Row label="Pick">
            <span className="font-medium">
              {sideLabel} at <span className="tabular">{pct(r.pick.confidence)}</span>
            </span>
          </Row>
          <Row label="Logged">
            <span className="tabular">{when(r.pick.createdAt)}</span>
          </Row>
          <Row label="Locks">
            <span className="tabular">{when(r.event.locksAt)}</span>
          </Row>
          {resolved ? (
            <Row label="Result">
              <span className="inline-flex flex-wrap items-center gap-2">
                <StateBadge state={right ? "right" : "wrong"} />
                <span className="text-muted-foreground">{event?.detail}</span>
              </span>
            </Row>
          ) : null}
          <Row label={agent ? "Agent's key" : "Signed by"}>
            {r.pick.signer ? (
              <span className="font-mono text-xs break-all" data-testid="signer">
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
          <details className="mt-4 rounded-lg bg-muted p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              {agent ? "What the agent signed" : "What the wallet signed"}
            </summary>
            <pre className="mt-2 font-mono break-all whitespace-pre-wrap text-muted-foreground">
              {r.signedMessage}
            </pre>
          </details>
        ) : null}
        {r.delegation ? (
          <details className="mt-2 rounded-lg bg-muted p-3 text-xs" data-testid="delegation">
            <summary className="cursor-pointer font-medium">
              What the owner signed: the delegation
              {r.delegation.revokedAt ? `, revoked ${when(r.delegation.revokedAt)}` : ""}
            </summary>
            <pre className="mt-2 font-mono break-all whitespace-pre-wrap text-muted-foreground">
              {r.delegation.message}
            </pre>
            {r.delegation.revokeMessage ? (
              <pre className="mt-2 border-t border-dashed pt-2 font-mono break-all whitespace-pre-wrap text-muted-foreground">
                {r.delegation.revokeMessage}
              </pre>
            ) : null}
          </details>
        ) : null}
        {/* The tear line of a paper receipt. */}
        <p className="mt-5 border-t border-dashed pt-4 font-mono text-xs break-all text-muted-foreground">
          leaf {r.leaf}
        </p>
      </article>

      <Section
        title="Verify"
        description="Checked against Sui through Tatum. No sign-in needed."
        actions={verify.data ? verdict(verify.data) : null}
      >
        <Card className="gap-4 px-5">
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
        </Card>
      </Section>

      <Section
        title="Don't trust us: try to fake it"
        description={
          <>
            Send an edited copy of this receipt to the same checks.{" "}
            {r.pick.signature
              ? "The copy has one character of the signature changed."
              : "The copy claims 99% confidence."}
          </>
        }
      >
        <Card className="gap-4 px-5">
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => tamper.mutate(r)}
            disabled={tamper.isPending}
          >
            <ShieldCheck />
            {tamper.isPending ? "Checking…" : "Verify a tampered copy"}
          </Button>
          <ErrorNote error={tamper.error} />
          {tamper.data ? (
            <div className="flex flex-col gap-3">
              <div>{verdict(tamper.data)}</div>
              <Checks v={tamper.data} testId="tampered-checks" />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Anyone can run these checks with{" "}
            <a className="underline underline-offset-2" href={`/api/receipts/${r.pick.id}`}>
              the receipt JSON
            </a>{" "}
            and any Sui node: <code className="font-mono">POST /api/verify</code>.
            {r.pick.signer ? ` Signer ${short(r.pick.signer)}.` : ""}
          </p>
        </Card>
      </Section>
    </Page>
  );
}
