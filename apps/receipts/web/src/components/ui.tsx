import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import type { Chip } from "../api.ts";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        "rounded-2xl border border-line bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

type Tone = "neutral" | "good" | "pending" | "bad" | "brain";

const TONES: Record<Tone, string> = {
  neutral: "border-line text-muted",
  good: "border-transparent bg-accent-soft text-accent",
  pending: "border-transparent bg-pending-soft text-pending",
  bad: "border-transparent bg-bad-soft text-bad",
  brain: "border-transparent bg-brain-soft text-brain",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-ink text-paper hover:opacity-90"
          : "border border-line bg-card text-ink hover:bg-paper",
        className,
      )}
    />
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </p>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/** A 🧠 chip: a conclusion Receipts acts on, linked to the Walrus Memory blob behind it. */
export function BrainChip({ chip, groupId }: { chip: Chip; groupId: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-xl bg-brain-soft px-2.5 py-1 text-xs text-brain">
      <span aria-hidden>🧠</span>
      <span>{chip.text}</span>
      {chip.blobId ? (
        <Link
          to={`/g/${groupId}/memory#${chip.blobId}`}
          className="font-mono underline decoration-dotted underline-offset-2"
          title={`Walrus Memory blob ${chip.blobId}`}
        >
          blob {chip.blobId.slice(0, 8)}…
        </Link>
      ) : null}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

export { cx };
