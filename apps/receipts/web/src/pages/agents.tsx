/**
 * Agents (RC7, ADR-0066): an owner lets an AI agent pick for them, with a delegation their wallet
 * signs, and connects the agent through MCP. The agent's own key signs every pick; its record sits on
 * the leaderboard like anyone's, labelled as the agent's. Revoking is one more signature.
 */
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Bot, Check, Copy, KeyRound, Plug, ShieldOff } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Delegation, type Group, type McpToken, type Member } from "../api.ts";
import { ErrorNote, Spinner, Tag } from "../components/receipts.tsx";
import { WalletButton } from "../components/wallet.tsx";
import { ago, sameAddress, short, when } from "../format.ts";
import { keys, useDelegations, useGroup, useMe, useTokens } from "../hooks.ts";
import { delegateMessage, tokenMessage, undelegateMessage, untokenMessage } from "../messages.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const DAYS = [1, 7, 30] as const;

function useSign() {
  const { mutateAsync } = useSignPersonalMessage();
  return async (text: string) => (await mutateAsync({ message: utf8(text) })).signature;
}

export function AgentsPage() {
  const { id = "" } = useParams();
  const group = useGroup(id);
  const delegations = useDelegations(id);
  const { account, me } = useMe(group.data);

  if (group.isError) return <ErrorNote error={group.error} />;
  if (!group.data) return <Spinner />;
  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        An agent picks for you with its own key, and its record counts on the leaderboard like
        anyone's.
      </p>

      {!account ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Connect the wallet you joined with</span>
          <WalletButton />
        </div>
      ) : !me ? (
        <p className="text-sm text-muted-foreground">
          This wallet isn't a member yet.{" "}
          <Link className="underline underline-offset-2" to={`/g/${id}`}>
            Join on the board
          </Link>
          , then come back to name your agent.
        </p>
      ) : (
        <DelegateForm group={group.data} me={me} />
      )}

      <Section title="Agents in this group">
        {delegations.isPending ? <Spinner /> : null}
        <ErrorNote error={delegations.error} />
        {delegations.data && !delegations.data.length ? (
          <EmptyState
            icon={<Bot />}
            title="No agents yet"
            description="Delegate one above, then connect it through MCP below."
          />
        ) : null}
        {delegations.data?.length ? (
          <div
            className="divide-y overflow-hidden rounded-lg border bg-card"
            data-testid="delegations"
          >
            {delegations.data.map((d) => (
              <DelegationRow
                key={d.id}
                d={d}
                group={group.data}
                mine={!!account && sameAddress(d.owner, account.address)}
              />
            ))}
          </div>
        ) : null}
      </Section>

      <Connect group={group.data} me={me} />
    </>
  );
}

function DelegateForm({ group, me }: { group: Group; me: Member }) {
  const qc = useQueryClient();
  const sign = useSign();
  const [agent, setAgent] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const go = useMutation({
    mutationFn: async () => {
      const at = new Date().toISOString();
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      const fields = {
        groupId: group.id,
        groupName: group.name,
        owner: me.address ?? "",
        agent: agent.trim(),
        agentName: name.trim(),
        until,
        at,
      };
      const signature = await sign(delegateMessage(fields));
      return api(`/api/groups/${group.id}/delegations`, {
        owner: fields.owner,
        agent: fields.agent,
        agentName: fields.agentName,
        until,
        at,
        signature,
      });
    },
    onSuccess: async () => {
      setAgent("");
      setName("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.delegations(group.id) }),
        qc.invalidateQueries({ queryKey: keys.group(group.id) }),
      ]);
    },
  });
  const ready = /^0x[0-9a-fA-F]{1,64}$/.test(agent.trim()) && name.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium">Delegate an agent</span>{" "}
        <span className="text-muted-foreground">
          It picks for <strong className="font-medium text-foreground">{me.label}</strong>.
        </span>
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) go.mutate();
        }}
      >
        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="agent-address" className="text-muted-foreground">
              The agent's Sui address
            </label>
            <Input
              id="agent-address"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="0x…"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="agent-name" className="text-muted-foreground">
              Its name
            </label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Forecaster"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex flex-wrap items-center gap-1.5 text-sm">
            <legend className="sr-only">How long</legend>
            <span className="text-muted-foreground">For</span>
            {DAYS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  days === d &&
                    "border-primary! bg-primary/10! text-primary hover:bg-primary/15! hover:text-primary",
                )}
              >
                {d === 1 ? "1 day" : `${d} days`}
              </Button>
            ))}
          </fieldset>
          <Button type="submit" size="sm" disabled={!ready || go.isPending}>
            {go.isPending ? "Waiting for your wallet…" : "Sign and delegate"}
          </Button>
        </div>
        <ErrorNote error={go.error} />
      </form>
    </div>
  );
}

function DelegationRow({ d, group, mine }: { d: Delegation; group: Group; mine: boolean }) {
  const qc = useQueryClient();
  const sign = useSign();
  const revoke = useMutation({
    mutationFn: async () => {
      const at = new Date().toISOString();
      const signature = await sign(
        undelegateMessage({
          groupId: group.id,
          groupName: group.name,
          owner: d.owner,
          agent: d.agent,
          agentName: d.agentName,
          at,
        }),
      );
      return api(`/api/groups/${group.id}/delegations/${d.id}/revoke`, { at, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.delegations(group.id) }),
  });
  const status = d.live ? "live" : d.revokedAt ? "revoked" : "ended";
  return (
    <div className="flex flex-col gap-1 px-3 py-2" data-testid="delegation" data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="flex min-w-0 items-center gap-1.5 font-medium">
            <Bot className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{d.agentName}</span>
            <Badge variant="accent">agent</Badge>
          </p>
          <span className="text-xs text-muted-foreground">
            Picks for {d.ownerName} ·{" "}
            <span className="font-mono" title={d.agent}>
              {short(d.agent)}
            </span>
          </span>
        </div>
        <Badge variant={d.live ? "success" : "outline"}>{status}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Picks <span className="tabular font-medium text-foreground">{d.picks}</span>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span>
          {d.live ? "Until" : d.revokedAt ? "Revoked" : "Ended"}{" "}
          <span className="tabular font-medium text-foreground">
            {when(d.revokedAt ?? d.until)}
          </span>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span>
          Delegated <span className="font-medium text-foreground">{ago(d.createdAt)}</span>
        </span>
      </div>
      {d.record.length ? (
        <div className="flex flex-wrap gap-1.5">
          {d.record.map((r) => (
            <span key={r.league} className="tabular text-xs text-muted-foreground">
              {r.league}: {r.hits}/{r.n} right · Brier {r.brier.toFixed(3)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No resolved picks yet, so no record.</p>
      )}
      <details className="border-t pt-1 text-xs">
        <summary className="cursor-pointer font-medium">What the owner signed</summary>
        <pre className="mt-1 font-mono break-all whitespace-pre-wrap text-muted-foreground">
          {d.message}
        </pre>
      </details>
      {mine && d.live ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => revoke.mutate()}
            disabled={revoke.isPending}
          >
            <ShieldOff />
            {revoke.isPending ? "Waiting for your wallet…" : "Revoke"}
          </Button>
          <ErrorNote error={revoke.error} />
        </div>
      ) : null}
    </div>
  );
}

function CopyLine({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code
        className="min-w-0 flex-1 rounded-md bg-muted/60 p-2 font-mono text-xs break-all whitespace-pre-wrap"
        data-testid={label}
      >
        {text}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function Connect({ group, me }: { group: Group; me: Member | undefined }) {
  const origin = window.location.origin;
  const stdio = `claude mcp add receipts \\\n  -e RECEIPTS_API_URL=${origin} -e RECEIPTS_GROUP=${group.id} \\\n  -e RECEIPTS_AGENT_KEY=<your agent's suiprivkey> \\\n  -- bun <repo>/apps/receipts/src/mcp/bin.ts`;
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-semibold">Connect your agent</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plug className="size-4 text-primary" aria-hidden />
            On the agent's machine: it signs its own picks
          </p>
          <p className="text-xs text-muted-foreground">
            The stdio server holds the agent's key; Receipts only checks the signature against the
            delegation. Tools:{" "}
            <span className="font-mono">
              list_markets, get_call, submit_pick, get_receipt, leaderboard
            </span>
            .
          </p>
          <CopyLine text={stdio} label="the stdio MCP command" />
        </div>
        <Tokens group={group} me={me} origin={origin} />
      </div>
    </details>
  );
}

function Tokens({ group, me, origin }: { group: Group; me: Member | undefined; origin: string }) {
  const qc = useQueryClient();
  const sign = useSign();
  const tokens = useTokens(group.id);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const at = new Date().toISOString();
      const owner = me?.address ?? "";
      const signature = await sign(
        tokenMessage({ groupId: group.id, groupName: group.name, owner, name: name.trim(), at }),
      );
      return api<{ token: string; name: string }>(`/api/groups/${group.id}/mcp-tokens`, {
        owner,
        name: name.trim(),
        at,
        signature,
      });
    },
    onSuccess: async (r) => {
      setFresh(r);
      setName("");
      await qc.invalidateQueries({ queryKey: keys.tokens(group.id) });
    },
  });
  const revoke = useMutation({
    mutationFn: async (t: McpToken) => {
      const at = new Date().toISOString();
      const signature = await sign(
        untokenMessage({
          groupId: group.id,
          groupName: group.name,
          owner: me?.address ?? "",
          tokenId: t.id,
          at,
        }),
      );
      return api(`/api/groups/${group.id}/mcp-tokens/${t.id}/revoke`, { at, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tokens(group.id) }),
  });
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-primary" aria-hidden />
        Remote, read-only: a token for cloud agents
      </p>
      <p className="text-xs text-muted-foreground">
        Streamable HTTP at <span className="font-mono">{origin}/mcp</span>. A token reads this group
        only and can't pick; it's shown once, kept as a hash, and lasts 30 days.
      </p>
      {me ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Who it's for, e.g. Claude"
            aria-label="Token name"
            className="flex-1"
          />
          <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Waiting for your wallet…" : "Sign and create a token"}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Join the group with a wallet to create one.</p>
      )}
      <ErrorNote error={create.error} />
      {fresh ? (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <p className="text-sm font-medium text-warning-foreground">
            Copy it now: it won't be shown again.
          </p>
          <CopyLine
            label="the remote MCP command"
            text={`claude mcp add --transport http receipts-read ${origin}/mcp \\\n  --header "Authorization: Bearer ${fresh.token}"`}
          />
        </div>
      ) : null}
      {tokens.data?.length ? (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card" data-testid="tokens">
          {tokens.data.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {t.calls} call{t.calls === 1 ? "" : "s"}
                  {t.lastUsedAt ? ` · last ${ago(t.lastUsedAt)}` : ""}
                </span>
              </span>
              {t.revokedAt ? (
                <Tag>revoked</Tag>
              ) : me ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke.mutate(t)}
                  disabled={revoke.isPending}
                >
                  Revoke
                </Button>
              ) : (
                <Badge variant="success">active</Badge>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorNote error={revoke.error} />
    </div>
  );
}
