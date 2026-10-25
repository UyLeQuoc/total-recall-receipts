/**
 * Receipts' own small pieces on Remora's kit (ADR-0066): the loading line, the error note, the 🧠 chip
 * that links a conclusion to its Walrus Memory blob, and one map from a pick's state to a badge.
 */
import { cn } from "cn";
import { Brain, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import type { Chip } from "../api.ts";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/** A 🧠 chip: a conclusion Receipts acts on, linked to the Walrus Memory blob behind it. */
export function BrainChip({ chip, groupId }: { chip: Chip; groupId: string }) {
  return (
    <span className="inline-flex items-start gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
      <Brain className="mt-px size-3.5 shrink-0" aria-label="Memory" />
      <span>
        {chip.text}
        {chip.blobId ? (
          <>
            {" "}
            <Link
              to={`/g/${groupId}/memory#${chip.blobId}`}
              className="font-mono whitespace-nowrap underline decoration-dotted underline-offset-2"
              title={`Walrus Memory blob ${chip.blobId}`}
            >
              blob {chip.blobId.slice(0, 8)}…
            </Link>
          </>
        ) : null}
      </span>
    </span>
  );
}

export type PickState =
  | "signed"
  | "unsigned"
  | "anchored"
  | "pending anchor"
  | "right"
  | "wrong"
  | "source"
  | "agent";

const VARIANT = {
  signed: "success",
  unsigned: "outline",
  anchored: "success",
  "pending anchor": "warning",
  right: "success",
  wrong: "destructive",
  source: "secondary",
  agent: "accent",
} as const;

/** One state → badge map, like Remora's StatusBadge; the text shown is the state itself. */
export function StateBadge({ state, className }: { state: PickState; className?: string }) {
  return (
    <Badge variant={VARIANT[state]} className={className}>
      {state}
    </Badge>
  );
}

/** A league or kind label. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-muted-foreground", className)}>
      {children}
    </Badge>
  );
}
