import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, Bot, CalendarClock, CircleCheck, Clock, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type BoardEvent, type Group, type Member, type PickResult } from "../api.ts";
import { BrainChip, ErrorNote, Spinner, StateBadge, Tag } from "../components/receipts.tsx";
import { WalletButton } from "../components/wallet.tsx";
import { pct, short, until, when } from "../format.ts";
import { keys, useBoard, useCall, useGroup, useMe, usePicks } from "../hooks.ts";
import { joinMessage, pickMessage } from "../messages.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);

export function BoardPage() {
  const { id = "" } = useParams();
  const group = useGroup(id);
  const board = useBoard(id);
  const { me } = useMe(group.data);

  if (group.isError) return <ErrorNote error={group.error} />;
  return (
    <>
      {group.data ? <Members group={group.data} me={me} /> : <Spinner />}
      {group.data ? <JoinPanel group={group.data} me={me} /> : null}

      <Section
        title="Open markets"
        actions={<span className="text-xs text-muted-foreground">P(yes) from every voice</span>}
      >
        {board.isPending ? <Spinner label="Loading the board…" /> : null}
        <ErrorNote error={board.error} />
        {board.data && !board.data.length ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Nothing open right now"
            description="The worker loads NBA, EPL and the midterms as their lines come out."
          />
        ) : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {board.data?.map((e) => (
            <MarketCard key={e.id} event={e} groupId={id} me={me} />
          ))}
        </div>
      </Section>

      <RecentPicks groupId={id} />
    </>
  );
}

function Members({ group, me }: { group: Group; me: Member | undefined }) {
  if (!group.members.length) {
    return <p className="text-sm text-muted-foreground">No members yet. Be the first to join.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Members">
      {group.members.map((m) => (
        <li
          key={m.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs",
            m.id === me?.id && "border-primary/50 bg-primary/5 font-medium",
            m.agentOf && "border-primary/30 bg-accent/50",
          )}
        >
          {m.agentOf ? <Bot className="size-3.5 text-primary" aria-label="Agent" /> : null}
          {m.label}
          {m.address ? (
            <span className="font-mono text-muted-foreground" title={m.address}>
              {short(m.address)}
            </span>
          ) : m.telegram ? (
            <span className="text-muted-foreground">Telegram</span>
          ) : (
            <span className="text-muted-foreground">no wallet</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function JoinPanel({ group, me }: { group: Group; me: Member | undefined }) {
  const { account } = useMe(group);
  const qc = useQueryClient();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [name, setName] = useState("");
  const [test, setTest] = useState(false);
  const join = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Connect a wallet first.");
      const at = new Date().toISOString();
      const message = joinMessage({
        groupId: group.id,
        groupName: group.name,
        name: name.trim(),
        address: account.address,
        test,
        at,
      });
      const { signature } = await signPersonalMessage({ message: utf8(message) });
      return api<Member>(`/api/groups/${group.id}/join`, {
        name: name.trim(),
        address: account.address,
        test,
        at,
        signature,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.group(group.id) }),
  });

  if (me) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          You're in as <strong className="font-medium text-foreground">{me.label}</strong>. Your
          picks are signed by <span className="font-mono">{short(me.address ?? "")}</span>.
        </span>
      </p>
    );
  }
  return (
    <Card className="gap-3 px-5">
      {!account ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </span>
            <div>
              <p className="font-medium">Join with your wallet</p>
              <p className="text-sm text-muted-foreground">
                Your wallet signs your picks. Nothing is paid and nothing leaves your wallet.
              </p>
            </div>
          </div>
          <WalletButton />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) join.mutate();
          }}
        >
          <div>
            <p className="font-medium">Join {group.name}</p>
            <p className="text-sm text-muted-foreground">
              Signing a message adds <span className="font-mono">{short(account.address)}</span> to
              the group. It costs nothing.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="member-name">
              Your name in the group
            </label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Your name in the group"
              className="flex-1"
            />
            <Button type="submit" disabled={!name.trim() || join.isPending}>
              {join.isPending ? "Waiting for your wallet…" : "Sign and join"}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4"
              checked={test}
              onChange={(e) => setTest(e.target.checked)}
            />
            I'm only testing: label me "(test)"
          </label>
          <ErrorNote error={join.error} />
        </form>
      )}
    </Card>
  );
}

function VoiceBar({
  label,
  prob,
  member,
  agent,
}: {
  label: string;
  prob: number;
  member: boolean;
  agent?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 text-sm">
      <div className="min-w-0">
        <span
          className={cn(
            "flex items-center gap-1.5 truncate",
            member ? "font-medium" : "text-muted-foreground",
          )}
        >
          {agent ? <Bot className="size-3.5 shrink-0 text-primary" aria-label="Agent" /> : null}
          <span className="truncate">{label}</span>
        </span>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", member ? "bg-primary" : "bg-foreground/35")}
            style={{ width: `${Math.round(prob * 100)}%` }}
          />
        </div>
      </div>
      <span className="tabular text-right font-medium">{pct(prob)}</span>
    </div>
  );
}

function ReceiptsCall({ groupId, event }: { groupId: string; event: BoardEvent }) {
  const call = useCall(groupId, event.id);
  if (call.isPending) return <Spinner label="Receipts is recalling what it learned…" />;
  if (call.isError || !call.data) {
    return (
      <p className="text-xs text-muted-foreground">
        Receipts' call needs Walrus Memory, and it didn't answer just now.
      </p>
    );
  }
  const c = call.data;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-accent/60 p-3">
      {c.prob !== null ? (
        <p className="text-sm">
          <span className="font-medium">
            Receipts: {pct(c.prob)} {event.yesLabel}
          </span>
          {c.average !== null ? (
            <span className="text-muted-foreground"> · plain average {pct(c.average)}</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No numbers yet for Receipts to weigh.</p>
      )}
      {c.chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {c.chips.map((ch) => (
            <BrainChip key={ch.text} chip={ch} groupId={groupId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MarketCard({
  event,
  groupId,
  me,
}: {
  event: BoardEvent;
  groupId: string;
  me: Member | undefined;
}) {
  const mine = me ? event.picks.find((p) => p.memberId === me.id) : undefined;
  const sources = event.voices.filter((v) => !v.member);
  const people = event.voices.filter((v) => v.member);
  return (
    <Card
      className="gap-4 px-5"
      data-testid="market"
      data-event={event.id}
      data-league={event.league}
      data-starts={event.startsAt}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{event.title}</p>
          <p className="text-xs text-muted-foreground">
            Yes = {event.yesLabel} · locks {when(event.startsAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Tag>{event.league}</Tag>
          <span className="tabular inline-flex items-center gap-1 text-xs text-warning-foreground">
            <Clock className="size-3" aria-hidden />
            {until(event.startsAt)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {sources.length ? (
          sources.map((v) => <VoiceBar key={v.voice} {...v} />)
        ) : (
          <p className="text-xs text-muted-foreground">No book or market line yet.</p>
        )}
        {people.length ? (
          <div className="flex flex-col gap-2.5 border-t border-dashed pt-2.5">
            {people.map((v) => (
              <VoiceBar key={v.voice} {...v} />
            ))}
          </div>
        ) : null}
      </div>
      <ReceiptsCall groupId={groupId} event={event} />
      {mine ? (
        <Link
          to={`/p/${mine.id}`}
          className="flex items-center justify-between gap-2 rounded-lg bg-success/15 px-3 py-2 text-sm text-success-foreground transition-colors hover:bg-success/25"
        >
          <span>
            Your pick:{" "}
            <strong className="font-medium">
              {mine.side === "yes" ? event.yesLabel : event.noLabel}
            </strong>{" "}
            at {pct(mine.confidence)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium">
            {mine.signed ? "Signed · receipt" : "Receipt"}
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </Link>
      ) : me ? (
        <PickForm event={event} groupId={groupId} me={me} />
      ) : null}
    </Card>
  );
}

function PickForm({ event, groupId, me }: { event: BoardEvent; groupId: string; me: Member }) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [confidence, setConfidence] = useState(65);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const sideLabel = side === "yes" ? event.yesLabel : event.noLabel;
  const pick = useMutation({
    mutationFn: async () => {
      const body = { groupId, memberId: me.id, eventId: event.id, side, confidence };
      if (!me.address) return api<PickResult>("/api/picks", body);
      const signedAt = new Date().toISOString();
      const message = pickMessage({
        groupId,
        eventId: event.id,
        eventTitle: event.title,
        side,
        sideLabel,
        confidencePct: confidence,
        at: signedAt,
      });
      const { signature } = await signPersonalMessage({ message: utf8(message) });
      return api<PickResult>("/api/picks", { ...body, signature, signedAt });
    },
    onSuccess: async (r) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.board(groupId) }),
        qc.invalidateQueries({ queryKey: keys.picks(groupId) }),
      ]);
      navigate(`/p/${r.pick.id}`, { state: { nudge: r.nudge } });
    },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        pick.mutate();
      }}
    >
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Your side</legend>
        {(["yes", "no"] as const).map((s) => (
          <Button
            key={s}
            type="button"
            variant={side === s ? "default" : "outline"}
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className="h-auto min-h-9 whitespace-normal py-1.5"
          >
            {s === "yes" ? event.yesLabel : event.noLabel}
          </Button>
        ))}
      </fieldset>
      <label className="flex items-center gap-3 text-sm">
        <span className="shrink-0 text-muted-foreground">How sure?</span>
        <input
          type="range"
          min={50}
          max={99}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="min-w-0 flex-1"
          aria-label="Confidence"
        />
        <span className="tabular w-10 text-right font-medium">{confidence}%</span>
      </label>
      <Button
        type="submit"
        disabled={pick.isPending}
        className="h-auto min-h-9 whitespace-normal py-2"
      >
        {pick.isPending
          ? "Waiting for your wallet…"
          : `Sign and lock in: ${sideLabel} at ${confidence}%`}
      </Button>
      <ErrorNote error={pick.error} />
    </form>
  );
}

function RecentPicks({ groupId }: { groupId: string }) {
  const picks = usePicks(groupId);
  if (!picks.data?.length) return null;
  return (
    <Section title="Recent picks">
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {picks.data.map((p) => (
          <Link
            key={p.id}
            to={`/p/${p.id}`}
            className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">
                <span className="font-medium">{p.member}</span> → {p.sideLabel} at{" "}
                {pct(p.confidence)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.title} · {p.league}
                {p.reason ? ` · “${p.reason}”` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {p.agent ? <StateBadge state="agent" /> : null}
              <StateBadge state={p.signed ? "signed" : "unsigned"} />
              <StateBadge state={p.anchored ? "anchored" : "pending anchor"} />
              {p.result === null ? null : <StateBadge state={p.result ? "right" : "wrong"} />}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
