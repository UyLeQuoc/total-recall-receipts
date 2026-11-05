import { cn } from "cn";
import { Brain } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { ErrorNote, Spinner } from "../components/receipts.tsx";
import { ago } from "../format.ts";
import { useMemories } from "../hooks.ts";

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
        Every conclusion Receipts acts on is a Walrus Memory blob; the 🧠 chips link to these.
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
      {rows.data?.length ? (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {rows.data.map((r) => {
            const kind = r.namespace.split(":").at(-1) ?? "";
            const hit = !!target && target === r.blobId;
            return (
              <article
                key={r.id}
                id={r.blobId ?? r.id}
                className={cn("scroll-mt-20 px-3 py-2", hit && "bg-primary/10")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{kind}</Badge>
                  <span className="text-xs text-muted-foreground">{ago(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed break-words">
                  {r.text || "(text pending)"}
                </p>
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {r.blobId ? `blob ${r.blobId}` : `status ${r.status}`}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
