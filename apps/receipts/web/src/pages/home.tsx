import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Lock, PenLine, Scale, Sparkles, Users } from "lucide-react";
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
    icon: PenLine,
    title: "Sign your pick",
    body: "Pick a side and how sure you are. Your wallet signs it: no gas, no app account.",
  },
  {
    icon: Lock,
    title: "Sealed before lock",
    body: "Every few minutes the group's picks are hashed into one root and anchored on Sui.",
  },
  {
    icon: Scale,
    title: "Scored against the market",
    body: "After the final whistle, everyone is scored against the books, Polymarket and Kalshi.",
  },
  {
    icon: Sparkles,
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
        description={
          <>
            Call the game before it starts. Your pick is signed by your wallet and sealed on Sui, so
            nobody can claim they "totally called it" afterwards.
          </>
        }
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
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.data?.map((g) => (
            <Link
              key={g.id}
              to={`/g/${g.id}`}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{g.name}</span>
                  {g.telegram ? <Badge variant="outline">Telegram</Badge> : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  {g.members} member{g.members === 1 ? "" : "s"} · started {ago(g.createdAt)}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
        <form
          className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row"
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

      <div id="how" className="scroll-mt-16">
        <Section
          title="How it works"
          description="Nothing here asks you to take Receipts' word for it."
        >
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden />
                  <span className="tabular text-xs font-medium text-muted-foreground">
                    Step {i + 1}
                  </span>
                </span>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </Page>
  );
}
