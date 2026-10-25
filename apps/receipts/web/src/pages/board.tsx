import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, type BoardEvent, type Group, type Member, type PickResult } from "../api.ts";
import {
  Badge,
  BrainChip,
  Button,
  Card,
  cx,
  ErrorNote,
  SectionTitle,
  Spinner,
} from "../components/ui.tsx";
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
    <div>
      {group.data ? <Members group={group.data} me={me} /> : <Spinner />}
      {group.data ? <JoinPanel group={group.data} me={me} /> : null}

      <SectionTitle aside={<span className="text-xs text-muted">P(yes) from every voice</span>}>
        Open markets
      </SectionTitle>
      {board.isPending ? <Spinner label="Loading the board…" /> : null}
      <ErrorNote error={board.error} />
      {board.data && !board.data.length ? (
        <p className="text-sm text-muted">
          Nothing open right now. The worker loads NBA, EPL and the midterms.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {board.data?.map((e) => (
          <MarketCard key={e.id} event={e} groupId={id} me={me} />
        ))}
      </div>

      <RecentPicks groupId={id} />
    </div>
  );
}

function Members({ group, me }: { group: Group; me: Member | undefined }) {
  if (!group.members.length) {
    return <p className="text-sm text-muted">No members yet. Be the first to join.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {group.members.map((m) => (
        <span
          key={m.id}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            m.id === me?.id ? "border-ink bg-card font-semibold" : "border-line bg-card",
          )}
        >
          {m.label}
          {m.address ? (
            <span className="font-mono text-muted" title={m.address}>
              {short(m.address)}
            </span>
          ) : m.telegram ? (
            <span className="text-muted">Telegram</span>
          ) : (
            <span className="text-muted">no wallet</span>
          )}
        </span>
      ))}
    </div>
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
      <p className="mt-4 text-sm text-muted">
        You're in as <strong className="text-ink">{me.label}</strong>. Your picks are signed by{" "}
        <span className="font-mono">{short(me.address ?? "")}</span>.
      </p>
    );
  }
  return (
    <Card className="mt-4">
      {!account ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Join with your wallet</p>
            <p className="text-sm text-muted">
              Your wallet signs your picks. Nothing is paid and nothing leaves your wallet.
            </p>
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
            <p className="font-semibold">Join {group.name}</p>
            <p className="text-sm text-muted">
              Signing a message adds <span className="font-mono">{short(account.address)}</span> to
              the group. It costs nothing.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="member-name">
              Your name in the group
            </label>
            <input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Your name in the group"
              className="min-h-10 flex-1 rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink"
            />
            <Button type="submit" disabled={!name.trim() || join.isPending}>
              {join.isPending ? "Waiting for your wallet…" : "Sign and join"}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} />
            I'm only testing: label me "(test)"
          </label>
          <ErrorNote error={join.error} />
        </form>
      )}
    </Card>
  );
}

function VoiceBar({ label, prob, member }: { label: string; prob: number; member: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 text-sm">
      <div className="min-w-0">
        <div className="flex justify-between gap-2">
          <span className={cx("truncate", member ? "font-medium" : "text-muted")}>{label}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className={cx("h-full rounded-full", member ? "bg-ink" : "bg-muted")}
            style={{ width: `${Math.round(prob * 100)}%` }}
          />
        </div>
      </div>
      <span className="tabular text-right font-semibold">{pct(prob)}</span>
    </div>
  );
}

function ReceiptsCall({ groupId, event }: { groupId: string; event: BoardEvent }) {
  const call = useCall(groupId, event.id);
  if (call.isPending) return <Spinner label="Receipts is recalling what it learned…" />;
  if (call.isError || !call.data) {
    return (
      <p className="text-xs text-muted">
        Receipts' call needs Walrus Memory, and it didn't answer just now.
      </p>
    );
  }
  const c = call.data;
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      {c.prob !== null ? (
        <p className="text-sm">
          <span className="font-semibold">
            Receipts: {pct(c.prob)} {event.yesLabel}
          </span>
          {c.average !== null ? (
            <span className="text-muted"> · plain average {pct(c.average)}</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">No numbers yet for Receipts to weigh.</p>
      )}
      {c.chips.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
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
      className="flex flex-col gap-4"
      data-testid="market"
      data-event={event.id}
      data-league={event.league}
      data-starts={event.startsAt}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{event.title}</p>
          <p className="text-xs text-muted">
            Yes = {event.yesLabel} · locks {when(event.startsAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge>{event.league}</Badge>
          <span className="tabular text-xs text-pending">{until(event.startsAt)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {sources.length ? (
          sources.map((v) => <VoiceBar key={v.voice} {...v} />)
        ) : (
          <p className="text-xs text-muted">No book or market line yet.</p>
        )}
        {people.length ? (
          <div className="mt-1 flex flex-col gap-2 border-t border-dashed border-line pt-2">
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
          className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent"
        >
          <span>
            Your pick: <strong>{mine.side === "yes" ? event.yesLabel : event.noLabel}</strong> at{" "}
            {pct(mine.confidence)}
          </span>
          <span className="font-medium">{mine.signed ? "Signed · receipt →" : "Receipt →"}</span>
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
      className="flex flex-col gap-3 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        pick.mutate();
      }}
    >
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Your side</legend>
        {(["yes", "no"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={cx(
              "min-h-10 rounded-xl border px-3 text-sm font-medium",
              side === s ? "border-ink bg-ink text-paper" : "border-line bg-card hover:border-ink",
            )}
          >
            {s === "yes" ? event.yesLabel : event.noLabel}
          </button>
        ))}
      </fieldset>
      <label className="flex items-center gap-3 text-sm">
        <span className="shrink-0 text-muted">How sure?</span>
        <input
          type="range"
          min={50}
          max={99}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="flex-1"
          aria-label="Confidence"
        />
        <span className="tabular w-10 text-right font-semibold">{confidence}%</span>
      </label>
      <Button type="submit" disabled={pick.isPending}>
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
    <>
      <SectionTitle>Recent picks</SectionTitle>
      <Card className="divide-y divide-line p-0 sm:p-0">
        {picks.data.map((p) => (
          <Link
            key={p.id}
            to={`/p/${p.id}`}
            className="flex flex-col gap-1 px-4 py-3 hover:bg-paper sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">
                <strong>{p.member}</strong> → {p.sideLabel} at {pct(p.confidence)}
              </p>
              <p className="truncate text-xs text-muted">
                {p.title} · {p.league}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {p.signed ? <Badge tone="good">signed</Badge> : <Badge>unsigned</Badge>}
              {p.anchored ? (
                <Badge tone="good">anchored</Badge>
              ) : (
                <Badge tone="pending">pending anchor</Badge>
              )}
              {p.result === null ? null : p.result ? (
                <Badge tone="good">right</Badge>
              ) : (
                <Badge tone="bad">wrong</Badge>
              )}
            </div>
          </Link>
        ))}
      </Card>
    </>
  );
}
