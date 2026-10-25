import { cn } from "cn";
import { Brain } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { ErrorNote, Spinner } from "../components/receipts.tsx";
import { ago } from "../format.ts";
import { useMemories } from "../hooks.ts";

const KIND_VARIANT = {
  trust: "success",
  radar: "warning",
  insights: "accent",
  picks: "outline",
} as const;

export function MemoryPage() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const rows = useMemories(id);
  const target = decodeURIComponent(hash.slice(1));

  useEffect(() => {
    if (target && rows.data) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [target, rows.data]);

  return (
    <>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Every conclusion Receipts acts on is a Walrus Memory on mainnet: trust snapshots, the books
        vs markets radar, members' insights and the picks themselves. The 🧠 chips on the board cite
        these blobs.
      </p>
      {rows.isPending ? <Spinner /> : null}
      <ErrorNote error={rows.error} />
      {rows.data && !rows.data.length ? (
        <EmptyState
          icon={<Brain />}
          title="No memories yet"
          description="Picks, trust snapshots and insights land here as the group plays."
        />
      ) : null}
      <div className="flex flex-col gap-3">
        {rows.data?.map((r) => {
          const kind = r.namespace.split(":").at(-1) ?? "";
          return (
            <article
              key={r.id}
              id={r.blobId ?? r.id}
              className={cn(
                "flex scroll-mt-20 flex-col gap-2 rounded-xl border bg-card p-4",
                target && target === r.blobId && "border-primary/60 ring-3 ring-primary/20",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={KIND_VARIANT[kind as keyof typeof KIND_VARIANT] ?? "outline"}>
                  {kind}
                </Badge>
                <span className="text-xs text-muted-foreground">{ago(r.createdAt)}</span>
              </div>
              <p className="font-mono text-xs leading-relaxed break-words">
                {r.text || "(text pending)"}
              </p>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {r.blobId ? `blob ${r.blobId}` : `status ${r.status}`}
              </p>
            </article>
          );
        })}
      </div>
    </>
  );
}
