import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Page, PageHeader, Section } from "@/components/app/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../api.ts";
import { ErrorNote, Spinner } from "../components/receipts.tsx";
import { ago } from "../format.ts";
import { keys, useGroups } from "../hooks.ts";

const STEPS = [
  {
    title: "Sign your pick",
    body: "Pick a side and how sure you are; your wallet signs it. No gas, no app account.",
  },
  {
    title: "Sealed before lock",
    body: "Every few minutes the group's picks are hashed into one root and anchored on Sui.",
  },
  {
    title: "Scored against the market",
    body: "After the final whistle, everyone is scored against the books, Polymarket and Kalshi.",
  },
  {
    title: "Receipts learns who to trust",
    body: "Trust snapshots go to Walrus Memory, and Receipts' own call cites the one it used.",
  },
];

export function HomePage() {
  const groups = useGroups();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: (n: string) => api<{ id: string }>("/api/groups", { name: n }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: keys.groups });
      navigate(`/g/${g.id}`);
    },
  });

  return (
    <Page title="Receipts">
      <PageHeader
        title="The group pick'em that keeps the receipts."
        titleClassName="text-2xl"
        description="Call the game before it starts. Your pick is signed by your wallet and sealed on Sui."
      />

      <Section title="Groups">
        {groups.isPending ? <Spinner /> : null}
        <ErrorNote error={groups.error} />
        {groups.data && !groups.data.length ? (
          <EmptyState
            icon={<Users />}
            title="No groups yet"
            description="Start one below and send the link to your friends."
          />
        ) : null}
        {groups.data?.length ? (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {groups.data.map((g) => (
              <Link
                key={g.id}
                to={`/g/${g.id}`}
                className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/40"
              >
                <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {g.members} member{g.members === 1 ? "" : "s"} · started {ago(g.createdAt)}
                  </span>
                </span>
                {g.telegram ? <Badge variant="outline">Telegram</Badge> : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        ) : null}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
        >
          <label className="sr-only" htmlFor="group-name">
            New group name
          </label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Name a new group, e.g. Friday NBA"
            className="flex-1"
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Start a group"}
          </Button>
        </form>
        <ErrorNote error={create.error} />
      </Section>

      <div id="how" className="mt-2 scroll-mt-16">
        <h2 className="text-sm font-semibold text-muted-foreground">How it works</h2>
        <ol className="mt-2 grid gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(({ title, body }) => (
            <li key={title} className="flex flex-col gap-0.5">
              <p>{title}</p>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  );
}
