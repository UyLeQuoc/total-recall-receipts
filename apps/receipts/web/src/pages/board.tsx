import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Bot, CalendarClock, Check, CircleCheck, Clock, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type BoardEvent, type Group, type Member, type PickResult } from "../api.ts";
import { BrainChip, ErrorNote, Spinner, StateBadge, Tag } from "../components/receipts.tsx";
import { WalletButton } from "../components/wallet.tsx";
import { clock, dayLabel, pct, short, until, urgent } from "../format.ts";
import { keys, useBoard, useCall, useGroup, useMe, usePicks } from "../hooks.ts";
import { joinMessage, pickMessage } from "../messages.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);

const SOURCES = ["books", "polymarket", "kalshi"] as const;

const SOURCE_NAME = { books: "Books", polymarket: "Polymarket", kalshi: "Kalshi" } as const;

/** The market list's one grid: game, lock, the three books, Receipts, action. */
const ROW =
  "md:grid md:grid-cols-[minmax(0,1fr)_5rem_3.25rem_4.25rem_3.25rem_3.5rem_5.5rem] md:items-center md:gap-x-2";

const sourceValue = (event: BoardEvent, key: (typeof SOURCES)[number]) =>
  event.voices.find((v) => v.voice === key)?.prob ?? null;

const sourceLabel = (event: BoardEvent, key: (typeof SOURCES)[number]) =>
  (event.voices.find((v) => v.voice === key)?.label ?? SOURCE_NAME[key]).replace(/\s*\(.*\)$/, "");

export function BoardPage() {
  const { id = "" } = useParams();
  const group = useGroup(id);
  const board = useBoard(id);
  const { me } = useMe(group.data);
  const [open, setOpen] = useState<string | null>(null);

  if (group.isError) return <ErrorNote error={group.error} />;

  const events = [...(board.data ?? [])].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const picked = (e: BoardEvent) => (me ? e.picks.some((p) => p.memberId === me.id) : false);
  const hero = events.find((e) => !picked(e)) ?? null;
  const rest = hero ? events.filter((e) => e.id !== hero.id) : events;
  const days = rest.reduce<{ day: string; events: BoardEvent[] }[]>((out, e) => {
    const day = dayLabel(e.startsAt);
    const last = out.at(-1);
    if (last?.day === day) last.events.push(e);
    else out.push({ day, events: [e] });
    return out;
  }, []);

  return (
    <>
      {group.data ? <Members group={group.data} me={me} /> : <Spinner />}
      {group.data ? <JoinPanel group={group.data} me={me} /> : null}

      {board.isPending ? <Spinner label="Loading the board…" /> : null}
      <ErrorNote error={board.error} />

      {hero ? <NextToLock event={hero} groupId={id} me={me} /> : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Open markets</h2>
          <span className="text-xs text-muted-foreground">Chance of yes</span>
        </div>
        {board.data && !board.data.length ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Nothing open right now"
            description="The worker loads NBA, EPL and the midterms as their lines come out."
          />
        ) : null}
        {days.length ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div
              className={cn(
                "hidden border-b px-3 py-1.5 text-xs text-muted-foreground",
                ROW,
                "md:grid",
              )}
            >
              <span className="truncate">Game</span>
              <span className="text-right">Locks</span>
              <span className="text-right">Books</span>
              <span className="text-right">Polymarket</span>
              <span className="text-right">Kalshi</span>
              <span className="text-right">Receipts</span>
              <span />
            </div>
            <div className="divide-y">
              {days.map((d) => (
                <Fragment key={`${d.day}-${d.events[0]?.id}`}>
                  <p className="bg-muted/40 px-3 py-1 text-xs text-muted-foreground">{d.day}</p>
                  {d.events.map((e) => (
                    <MarketRow
                      key={e.id}
                      event={e}
                      groupId={id}
                      me={me}
                      open={open === e.id}
                      onToggle={() => setOpen(open === e.id ? null : e.id)}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <RecentPicks groupId={id} />
    </>
  );
}

function Members({ group, me }: { group: Group; me: Member | undefined }) {
  if (!group.members.length) return null;
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer">Members</summary>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Members">
        {group.members.map((m) => (
          <li
            key={m.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              m.id === me?.id && "border-primary/50 font-medium text-foreground",
            )}
          >
            {m.agentOf ? <Bot className="size-3 shrink-0" aria-label="Agent" /> : null}
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
    </details>
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
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
        <span>
          You're in as <strong className="font-medium text-foreground">{me.label}</strong>.
        </span>
      </p>
    );
  }
  if (!account) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Wallet className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium">Join with your wallet</span>
        <span className="text-xs text-muted-foreground">Signing costs nothing.</span>
        <WalletButton />
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) join.mutate();
      }}
    >
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4"
            checked={test}
            onChange={(e) => setTest(e.target.checked)}
          />
          I'm only testing: label me "(test)"
        </label>
        <p className="text-xs text-muted-foreground">Signing costs nothing.</p>
      </div>
      <ErrorNote error={join.error} />
    </form>
  );
}

function Countdown({ startsAt }: { startsAt: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 whitespace-nowrap text-xs",
        urgent(startsAt) ? "text-warning-foreground" : "text-muted-foreground",
      )}
    >
      <Clock className="size-3" aria-hidden />
      {until(startsAt)}
    </span>
  );
}

/** The biggest thing on the page: the market that locks first, and Receipts' call on it. */
function NextToLock({
  event,
  groupId,
  me,
}: {
  event: BoardEvent;
  groupId: string;
  me: Member | undefined;
}) {
  const call = useCall(groupId, event.id);
  const prob = call.data?.prob ?? null;
  const answered = !call.isError && prob !== null;

  const numbers = (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      {SOURCES.map((k) => {
        const value = sourceValue(event, k);
        return (
          <div key={k}>
            <p className="text-xs text-muted-foreground">{sourceLabel(event, k)}</p>
            <p className={cn("text-xl tabular", value === null && "text-muted-foreground")}>
              {value === null ? "—" : pct(value)}
            </p>
          </div>
        );
      })}
    </div>
  );

  const callNote = call.isPending ? (
    <Spinner label="Receipts is recalling what it learned…" />
  ) : (
    <p className="text-xs text-muted-foreground">
      {call.isError
        ? "Receipts' call needs Walrus Memory, which didn't answer."
        : "No numbers yet for Receipts to weigh."}
    </p>
  );

  return (
    <section
      className="rounded-lg border bg-card p-4"
      data-testid="market"
      data-event={event.id}
      data-league={event.league}
      data-starts={event.startsAt}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Next to lock
          </span>
          <Tag>{event.league}</Tag>
        </div>
        <Countdown startsAt={event.startsAt} />
      </div>
      <p className="mt-1 text-xl font-semibold">{event.title}</p>
      <p className="text-xs text-muted-foreground">Yes = {event.yesLabel}</p>

      <div className="mt-3 flex flex-col gap-2">
        {answered ? (
          <>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Receipts</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-4xl font-semibold tabular text-primary">{pct(prob)}</p>
                <span className="text-sm font-medium">{event.yesLabel}</span>
                {call.data && call.data.average !== null ? (
                  <span className="text-sm text-muted-foreground">
                    plain average {pct(call.data.average)}
                  </span>
                ) : null}
              </div>
            </div>
            {call.data?.chips.length ? (
              <div className="flex flex-wrap gap-1">
                {call.data.chips.map((ch) => (
                  <BrainChip key={ch.text} chip={ch} groupId={groupId} />
                ))}
              </div>
            ) : null}
            {numbers}
          </>
        ) : (
          <>
            {numbers}
            {callNote}
            {call.data?.chips.length ? (
              <div className="flex flex-wrap gap-1">
                {call.data.chips.map((ch) => (
                  <BrainChip key={ch.text} chip={ch} groupId={groupId} />
                ))}
              </div>
            ) : null}
          </>
        )}
        <Voices voices={event.voices} />
      </div>

      {me && !event.picks.some((p) => p.memberId === me.id) ? (
        <div className="mt-3">
          <PickForm event={event} groupId={groupId} me={me} />
        </div>
      ) : null}
    </section>
  );
}

function NumberCell({
  label,
  value,
  strong,
}: {
  label: string;
  value: number | null;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0 md:text-right">
      <span className="block text-xs text-muted-foreground md:hidden">{label}</span>
      <span
        className={cn(
          "tabular text-sm",
          value === null
            ? "text-muted-foreground"
            : strong
              ? "font-semibold text-primary"
              : undefined,
        )}
      >
        {value === null ? "—" : pct(value)}
      </span>
    </div>
  );
}

function Voices({ voices }: { voices: BoardEvent["voices"] }) {
  const people = voices.filter((v) => v.member);
  if (!people.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {people.map((v) => (
        <li key={v.voice} className="inline-flex min-w-0 items-center gap-1">
          {v.agent ? <Bot className="size-3 shrink-0" aria-label="Agent" /> : null}
          <span className="truncate">{v.label}</span>
          <span className="tabular">{pct(v.prob)}</span>
        </li>
      ))}
    </ul>
  );
}

function MarketRow({
  event,
  groupId,
  me,
  open,
  onToggle,
}: {
  event: BoardEvent;
  groupId: string;
  me: Member | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const mine = me ? event.picks.find((p) => p.memberId === me.id) : undefined;
  const canPick = !!me && !mine;
  const call = useCall(groupId, event.id);
  const receipts = call.isError ? null : (call.data?.prob ?? null);

  return (
    <div
      data-testid="market"
      data-event={event.id}
      data-league={event.league}
      data-starts={event.startsAt}
      className="px-3 py-2"
    >
      <div className={cn("flex flex-col gap-1.5", ROW)}>
        <div className="flex items-start gap-2 md:contents">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-snug">{event.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              Yes = {event.yesLabel} · {event.league}
              <span
                className={cn(
                  "tabular md:hidden",
                  urgent(event.startsAt) && "text-warning-foreground",
                )}
              >
                {" · "}
                {until(event.startsAt)}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5 md:order-last">
            {mine ? (
              <Link
                to={`/p/${mine.id}`}
                className="tabular hidden text-xs hover:underline md:block md:text-right"
              >
                Your pick: {mine.side === "yes" ? event.yesLabel : event.noLabel} at{" "}
                {pct(mine.confidence)}
              </Link>
            ) : null}
            {mine || !canPick ? (
              <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
                Details
              </Button>
            ) : (
              <Button variant="outline" size="sm" aria-expanded={open} onClick={onToggle}>
                Pick
              </Button>
            )}
          </div>
        </div>

        <div className="hidden flex-col items-end text-xs md:flex">
          <span className="tabular text-muted-foreground">{clock(event.startsAt)}</span>
          <Countdown startsAt={event.startsAt} />
        </div>

        <div className="grid grid-cols-4 gap-2 md:contents">
          {SOURCES.map((k) => (
            <NumberCell key={k} label={sourceLabel(event, k)} value={sourceValue(event, k)} />
          ))}
          <NumberCell label="Receipts" value={receipts} strong />
        </div>

        {mine ? (
          <Link to={`/p/${mine.id}`} className="tabular text-xs hover:underline md:hidden">
            Your pick: {mine.side === "yes" ? event.yesLabel : event.noLabel} at{" "}
            {pct(mine.confidence)}
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          <RowDetail groupId={groupId} event={event} />
          <Voices voices={event.voices} />
          {canPick && me ? <PickForm event={event} groupId={groupId} me={me} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** What a collapsed row leaves out: the 🧠 chips, or the one note that there are none. */
function RowDetail({ groupId, event }: { groupId: string; event: BoardEvent }) {
  const call = useCall(groupId, event.id);
  if (call.isPending) return <Spinner label="Receipts is recalling what it learned…" />;
  if (call.isError) {
    return (
      <p className="text-xs text-muted-foreground">
        Receipts' call needs Walrus Memory, which didn't answer.
      </p>
    );
  }
  if (!call.data?.chips.length) {
    return call.data?.prob === null ? (
      <p className="text-xs text-muted-foreground">No numbers yet for Receipts to weigh.</p>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {call.data.chips.map((ch) => (
        <BrainChip key={ch.text} chip={ch} groupId={groupId} />
      ))}
    </div>
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
      className="flex flex-col gap-2 border-t pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        pick.mutate();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <fieldset className="grid grid-cols-2 gap-1.5 sm:flex sm:shrink-0">
          <legend className="sr-only">Your side</legend>
          {(["yes", "no"] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={side === s}
              onClick={() => setSide(s)}
              className={cn(
                "h-auto min-h-8 whitespace-normal py-1",
                side === s &&
                  "border-primary! bg-primary/10! text-primary hover:bg-primary/15! hover:text-primary",
              )}
            >
              {side === s ? <Check aria-hidden /> : null}
              {s === "yes" ? event.yesLabel : event.noLabel}
            </Button>
          ))}
        </fieldset>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
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
          <span className="tabular w-9 shrink-0 text-right font-medium">{confidence}%</span>
        </label>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={pick.isPending}
        className="h-auto min-h-8 whitespace-normal py-1.5"
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
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {picks.data.map((p) => (
          <Link
            key={p.id}
            to={`/p/${p.id}`}
            className="flex flex-col gap-1 px-3 py-2 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
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
