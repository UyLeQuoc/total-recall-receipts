import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api.ts";
import { Badge, Button, Card, ErrorNote, SectionTitle, Spinner } from "../components/ui.tsx";
import { ago } from "../format.ts";
import { keys, useGroups } from "../hooks.ts";

const STEPS = [
  {
    title: "Sign your pick",
    body: "Pick a side and how sure you are. Your wallet signs it: no gas, no app account.",
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
    <div>
      <section className="py-4 sm:py-8">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          The group-chat pick'em that keeps the receipts.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">
          Call the game before it starts. Your pick is signed by your wallet and sealed on Sui, so
          nobody can claim they "totally called it" afterwards.
        </p>
      </section>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line bg-card p-4">
            <span className="tabular text-xs font-semibold text-accent">0{i + 1}</span>
            <p className="mt-1 font-semibold">{s.title}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      <SectionTitle>Groups</SectionTitle>
      {groups.isPending ? <Spinner /> : null}
      <ErrorNote error={groups.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.data?.map((g) => (
          <Link
            key={g.id}
            to={`/g/${g.id}`}
            className="group rounded-2xl border border-line bg-card p-4 transition hover:border-ink"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold group-hover:underline">{g.name}</p>
              {g.telegram ? <Badge>Telegram</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {g.members} member{g.members === 1 ? "" : "s"} · started {ago(g.createdAt)}
            </p>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
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
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Name a new group, e.g. Friday NBA"
            className="min-h-10 flex-1 rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink"
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Start a group"}
          </Button>
        </form>
        <div className="mt-2">
          <ErrorNote error={create.error} />
        </div>
      </Card>
    </div>
  );
}
