import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { Badge, Card, cx, ErrorNote, Spinner } from "../components/ui.tsx";
import { ago } from "../format.ts";
import { useMemories } from "../hooks.ts";

const KIND_TONE = { trust: "good", radar: "pending", insights: "brain", picks: "neutral" } as const;

export function MemoryPage() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const rows = useMemories(id);
  const target = decodeURIComponent(hash.slice(1));

  useEffect(() => {
    if (target && rows.data) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [target, rows.data]);

  return (
    <div>
      <p className="max-w-2xl text-sm text-muted">
        Every conclusion Receipts acts on is a Walrus Memory on mainnet: trust snapshots, the books
        vs markets radar, members' insights and the picks themselves. The 🧠 chips on the board cite
        these blobs.
      </p>
      {rows.isPending ? <Spinner /> : null}
      <ErrorNote error={rows.error} />
      <div className="mt-4 flex flex-col gap-3">
        {rows.data?.map((r) => {
          const kind = r.namespace.split(":").at(-1) ?? "";
          return (
            <Card
              key={r.id}
              id={r.blobId ?? r.id}
              className={cx(target && target === r.blobId && "ring-2 ring-brain")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={KIND_TONE[kind as keyof typeof KIND_TONE] ?? "neutral"}>{kind}</Badge>
                <span className="text-xs text-muted">{ago(r.createdAt)}</span>
              </div>
              <p className="mt-2 break-words font-mono text-xs leading-relaxed">
                {r.text || "(text pending)"}
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-muted">
                {r.blobId ? `blob ${r.blobId}` : `status ${r.status}`}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
